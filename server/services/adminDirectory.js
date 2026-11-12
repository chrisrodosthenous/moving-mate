const mongoose = require('mongoose');
const User = require('../models/User');
const TransportOrder = require('../models/TransportOrder');
const { CYPRUS_DISTRICTS } = require('../constants/cyprusDistricts');
const { shapeOrderDocForClient, shapeDriverForAdmin } = require('./adminShapes');

const COMPLETED = new Set(['delivered', 'completed']);
const IN_PROGRESS = new Set([
  'accepted',
  'picked_up',
  'driver_is_on_the_way',
  'in_progress',
  'delivery_in_progress',
]);

function pageWindow(query) {
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const offset = Math.max(0, Number(query.offset) || 0);
  return { limit, offset };
}

function vehicleTypeLabel(type) {
  switch (type) {
    case 'pickup':
      return 'Pickup';
    case 'minivan':
      return 'Mini Van';
    case 'van':
      return 'Van';
    case 'truck':
      return 'Truck';
    case 'small':
      return 'Small Van / Pickup';
    case 'large':
      return 'Large Van (Transit)';
    default:
      return '—';
  }
}

function formatCreated(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsExpr(inputExpr, raw) {
  const q = String(raw ?? '').trim();
  if (!q) return null;
  return {
    $regexMatch: {
      input: { $toString: { $ifNull: [inputExpr, ''] } },
      regex: escapeRegex(q),
      options: 'i',
    },
  };
}

function andExpr(parts) {
  const exprs = parts.filter(Boolean);
  if (!exprs.length) return null;
  if (exprs.length === 1) return exprs[0];
  return { $and: exprs };
}

function text(value) {
  return { $toString: { $ifNull: [value, ''] } };
}

function oneDecimalExpr(field) {
  return {
    $let: {
      vars: { scaled: { $round: [{ $multiply: [{ $ifNull: [field, 0] }, 10] }, 0] } },
      in: {
        $concat: [
          text({ $trunc: { $divide: ['$$scaled', 10] } }),
          '.',
          text({ $abs: { $mod: ['$$scaled', 10] } }),
        ],
      },
    },
  };
}

function twoDecimalExpr(field) {
  return {
    $let: {
      vars: { scaled: { $round: [{ $multiply: [{ $ifNull: [field, 0] }, 100] }, 0] } },
      in: {
        $concat: [
          { $cond: [{ $lt: ['$$scaled', 0] }, '-', ''] },
          text({ $trunc: { $divide: [{ $abs: '$$scaled' }, 100] } }),
          '.',
          {
            $let: {
              vars: { cents: { $abs: { $mod: ['$$scaled', 100] } } },
              in: {
                $cond: [
                  { $lt: ['$$cents', 10] },
                  { $concat: ['0', text('$$cents')] },
                  text('$$cents'),
                ],
              },
            },
          },
        ],
      },
    },
  };
}

function floorExpr(field) {
  return {
    $cond: [{ $or: [{ $eq: [field, null] }, { $eq: [field, ''] }] }, '0', text(field)],
  };
}

const fullNameExpr = {
  $let: {
    vars: {
      joined: {
        $trim: {
          input: {
            $concat: [{ $ifNull: ['$firstName', ''] }, ' ', { $ifNull: ['$lastName', ''] }],
          },
        },
      },
    },
    in: {
      $cond: [{ $gt: [{ $strLenCP: '$$joined' }, 0] }, '$$joined', { $ifNull: ['$email', '—'] }],
    },
  },
};

const customerDistrictExpr = {
  $let: {
    vars: { district: { $trim: { input: { $ifNull: ['$district', ''] } } } },
    in: { $cond: [{ $gt: [{ $strLenCP: '$$district' }, 0] }, '$$district', '—'] },
  },
};

const driverDistrictListExpr = {
  $reduce: {
    input: { $ifNull: ['$districts', []] },
    initialValue: [],
    in: {
      $cond: [
        {
          $and: [{ $in: ['$$this', CYPRUS_DISTRICTS] }, { $not: [{ $in: ['$$this', '$$value'] }] }],
        },
        { $concatArrays: ['$$value', ['$$this']] },
        '$$value',
      ],
    },
  },
};

const driverDistrictExpr = {
  $let: {
    vars: {
      list: driverDistrictListExpr,
      legacy: { $trim: { input: { $ifNull: ['$district', ''] } } },
    },
    in: {
      $cond: [
        { $gt: [{ $size: '$$list' }, 0] },
        {
          $reduce: {
            input: '$$list',
            initialValue: '',
            in: {
              $cond: [{ $eq: ['$$value', ''] }, '$$this', { $concat: ['$$value', ', ', '$$this'] }],
            },
          },
        },
        {
          $cond: [
            { $in: ['$$legacy', CYPRUS_DISTRICTS] },
            '$$legacy',
            { $cond: [{ $gt: [{ $strLenCP: '$$legacy' }, 0] }, '$$legacy', 'All districts'] },
          ],
        },
      ],
    },
  },
};

const vehicleLabelExpr = {
  $let: {
    vars: {
      model: { $trim: { input: { $ifNull: ['$carModel', ''] } } },
      plate: { $trim: { input: { $ifNull: ['$plateNumber', ''] } } },
    },
    in: {
      $switch: {
        branches: [
          {
            case: {
              $and: [{ $gt: [{ $strLenCP: '$$model' }, 0] }, { $gt: [{ $strLenCP: '$$plate' }, 0] }],
            },
            then: { $concat: ['$$model', ' · ', '$$plate'] },
          },
          { case: { $gt: [{ $strLenCP: '$$model' }, 0] }, then: '$$model' },
          { case: { $gt: [{ $strLenCP: '$$plate' }, 0] }, then: '$$plate' },
        ],
        default: '—',
      },
    },
  },
};

const ratingTextExpr = {
  $cond: [
    { $isNumber: '$averageRating' },
    oneDecimalExpr('$averageRating'),
    '—',
  ],
};

const driverAvailabilityExpr = {
  $switch: {
    branches: [
      { case: { $eq: ['$isSuspended', true] }, then: 'Suspended' },
      {
        case: {
          $or: [{ $ne: ['$isVerified', true] }, { $eq: ['$verificationStatus', 'rejected'] }],
        },
        then: 'Offline',
      },
      { case: { $gt: ['$busyCount', 0] }, then: 'Busy' },
      {
        case: {
          $or: [{ $eq: ['$verificationStatus', 'approved'] }, { $eq: ['$isVerified', true] }],
        },
        then: 'Online',
      },
    ],
    default: 'Offline',
  },
};

function exactNumber(raw) {
  const textValue = String(raw ?? '').trim();
  if (!textValue) return { active: false, value: null };
  const value = Number(textValue);
  return { active: true, value: Number.isFinite(value) ? value : null };
}

function asObjectId(value) {
  const textValue = String(value ?? '').trim();
  if (/^[a-fA-F0-9]{24}$/.test(textValue)) return new mongoose.Types.ObjectId(textValue);
  return textValue;
}

async function facetPage(model, pipeline, offset, limit) {
  const [result] = await model.aggregate([
    ...pipeline,
    {
      $facet: {
        meta: [{ $count: 'total' }],
        items: [{ $skip: offset }, { $limit: limit }],
      },
    },
  ]);
  return {
    items: result?.items ?? [],
    total: result?.meta?.[0]?.total ?? 0,
    offset,
    limit,
  };
}

function shapeDirectoryUser(user, extra) {
  const shaped = shapeDriverForAdmin(user);
  delete shaped.password;
  return { ...shaped, ...extra };
}

async function listCustomers(query) {
  const { limit, offset } = pageWindow(query);
  const match = { role: 'customer' };
  if (query.status === 'Suspended') match.isSuspended = true;
  if (query.status === 'Active') match.isSuspended = { $ne: true };
  if (query.district && query.district !== 'all') {
    match.district = query.district === '—' ? { $in: [null, ''] } : query.district;
  }
  const orders = exactNumber(query.orders);
  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: TransportOrder.collection.collectionName,
        localField: '_id',
        foreignField: 'customerId',
        pipeline: [{ $count: 'count' }],
        as: 'orderCount',
      },
    },
    {
      $addFields: {
        totalOrders: { $ifNull: [{ $arrayElemAt: ['$orderCount.count', 0] }, 0] },
        fullName: fullNameExpr,
        districtLabel: customerDistrictExpr,
        statusLabel: { $cond: [{ $eq: ['$isSuspended', true] }, 'Suspended', 'Active'] },
      },
    },
  ];
  if (orders.active) pipeline.push({ $match: { totalOrders: orders.value == null ? -1 : orders.value } });
  const textMatch = andExpr([
    containsExpr(
      {
        $concat: [
          text('$fullName'),
          ' ',
          text('$email'),
          ' ',
          text('$phoneNumber'),
          ' ',
          text('$districtLabel'),
          ' ',
          text('$statusLabel'),
        ],
      },
      query.search,
    ),
    containsExpr('$fullName', query.name),
    containsExpr({ $concat: [text('$email'), ' ', text('$phoneNumber')] }, query.contact),
  ]);
  if (textMatch) pipeline.push({ $match: { $expr: textMatch } });
  pipeline.push({ $sort: { createdAt: -1, _id: -1 } });
  const [page, districtValues] = await Promise.all([
    facetPage(User, pipeline, offset, limit),
    User.distinct('district', { role: 'customer' }),
  ]);
  const districts = [...new Set(districtValues.map((value) => String(value ?? '').trim()).filter((value) => value && value !== '—'))].sort(
    (a, b) => a.localeCompare(b),
  );
  return {
    ...page,
    items: page.items.map((user) =>
      shapeDirectoryUser(user, {
        totalOrders: user.totalOrders || 0,
        districtLabel: user.districtLabel,
        fullName: user.fullName,
        statusLabel: user.statusLabel,
      }),
    ),
    districts,
  };
}

async function listDrivers(query) {
  const { limit, offset } = pageWindow(query);
  const trips = exactNumber(query.trips);
  const pipeline = [
    { $match: { role: 'driver' } },
    {
      $lookup: {
        from: TransportOrder.collection.collectionName,
        localField: '_id',
        foreignField: 'driverId',
        pipeline: [
          {
            $group: {
              _id: null,
              completed: {
                $sum: { $cond: [{ $in: ['$status', [...COMPLETED]] }, 1, 0] },
              },
              busy: {
                $sum: { $cond: [{ $in: ['$status', [...IN_PROGRESS]] }, 1, 0] },
              },
            },
          },
        ],
        as: 'tripStats',
      },
    },
    {
      $addFields: {
        completedTrips: { $ifNull: [{ $arrayElemAt: ['$tripStats.completed', 0] }, 0] },
        busyCount: { $ifNull: [{ $arrayElemAt: ['$tripStats.busy', 0] }, 0] },
        fullName: fullNameExpr,
        districtLabel: driverDistrictExpr,
        vehicleLabel: vehicleLabelExpr,
        ratingText: ratingTextExpr,
      },
    },
    { $addFields: { availabilityLabel: driverAvailabilityExpr } },
  ];
  if (trips.active) pipeline.push({ $match: { completedTrips: trips.value == null ? -1 : trips.value } });
  if (query.district && query.district !== 'all') pipeline.push({ $match: { districtLabel: query.district } });
  if (query.availability && query.availability !== 'all') {
    pipeline.push({ $match: { availabilityLabel: query.availability } });
  }
  const textMatch = andExpr([
    containsExpr(
      {
        $concat: [
          text('$fullName'),
          ' ',
          text('$districtLabel'),
          ' ',
          text('$vehicleLabel'),
          ' ',
          text('$availabilityLabel'),
          ' ',
          text('$ratingText'),
        ],
      },
      query.search,
    ),
    containsExpr('$fullName', query.name),
    containsExpr('$ratingText', query.rating),
    containsExpr('$vehicleLabel', query.vehicle),
  ]);
  if (textMatch) pipeline.push({ $match: { $expr: textMatch } });
  pipeline.push({ $sort: { createdAt: -1, _id: -1 } });
  const [page, districtRows] = await Promise.all([
    facetPage(User, pipeline, offset, limit),
    User.aggregate([
      { $match: { role: 'driver' } },
      { $project: { districtLabel: driverDistrictExpr } },
      { $group: { _id: '$districtLabel' } },
    ]),
  ]);
  const districts = districtRows
    .map((row) => row._id)
    .filter((label) => label && label !== 'All districts')
    .sort((a, b) => a.localeCompare(b));
  return {
    ...page,
    items: page.items.map((user) =>
      shapeDirectoryUser(user, {
        fullName: user.fullName,
        districtLabel: user.districtLabel,
        vehicleLabel: user.vehicleLabel,
        completedTrips: user.completedTrips || 0,
        availabilityLabel: user.availabilityLabel,
        ratingText: user.ratingText,
      }),
    ),
    districts,
  };
}

const STATUS_FILTER = {
  Available: { status: 'pending' },
  'Driver is on the way': { status: 'driver_is_on_the_way' },
  'In Progress': { status: { $in: ['accepted', 'picked_up', 'in_progress', 'delivery_in_progress'] } },
  Delivered: { status: { $in: ['delivered', 'completed'] } },
  Cancelled: { status: { $in: ['cancelled', 'canceled'] } },
};

const VEHICLE_FILTER = {
  Pickup: 'pickup',
  'Mini Van': 'minivan',
  Van: 'van',
  Truck: 'truck',
  'Small Van / Pickup': 'small',
  'Large Van (Transit)': 'large',
};

const DISTRICT_NAMES = ['Nicosia', 'Limassol', 'Larnaca', 'Paphos', 'Famagusta'];

function orderQueryParts(query) {
  const filter = {};
  if (query.status && query.status !== 'all' && STATUS_FILTER[query.status]) {
    Object.assign(filter, STATUS_FILTER[query.status]);
  }
  if (query.vehicle && query.vehicle !== 'all' && VEHICLE_FILTER[query.vehicle]) {
    filter.vehicleType = VEHICLE_FILTER[query.vehicle];
  }
  if (query.customerId) filter.customerId = asObjectId(query.customerId);
  if (query.driverId) filter.driverId = asObjectId(query.driverId);
  const place = String(query.place || '').trim();
  const exactDistrict = DISTRICT_NAMES.find((name) => name.toLowerCase() === place.toLowerCase());
  if (exactDistrict) filter.pickupDistrict = exactDistrict;
  const textPlace = exactDistrict ? '' : place;
  const needsScan = Boolean(
    String(query.search || '').trim() ||
      String(query.id || '').trim() ||
      String(query.customer || '').trim() ||
      String(query.driver || '').trim() ||
      textPlace ||
      String(query.logistics || '').trim() ||
      String(query.price || '').trim() ||
      String(query.created || '').trim(),
  );
  return { filter, textPlace, needsScan };
}

async function vehicleLabels() {
  const types = await TransportOrder.distinct('vehicleType');
  return [...new Set(types.map((type) => vehicleTypeLabel(type)).filter((label) => label && label !== '—'))].sort((a, b) =>
    a.localeCompare(b),
  );
}

async function listOrders(query) {
  const { limit, offset } = pageWindow(query);
  const { filter, textPlace, needsScan } = orderQueryParts(query);
  const vehicles = await vehicleLabels();
  const base = TransportOrder.find(filter)
    .populate('customerId', 'firstName lastName email phoneNumber')
    .populate('driverId', 'firstName lastName email phoneNumber carModel plateNumber')
    .sort({ createdAt: -1 });

  if (!needsScan) {
    const [total, docs] = await Promise.all([
      TransportOrder.countDocuments(filter),
      base.skip(offset).limit(limit).lean(),
    ]);
    return { items: docs.map((doc) => shapeOrderDocForClient(doc)), total, offset, limit, vehicles };
  }

  const createdExpr = {
    $dateToString: {
      format: '%d %b %Y, %H:%M',
      date: '$createdAt',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    },
  };
  const floorsExpr = {
    $concat: ['Floor: ', floorExpr('$pickupFloor'), ' ', floorExpr('$destinationFloor')],
  };
  const personName = (docField) => ({
    $let: {
      vars: {
        person: { $arrayElemAt: [docField, 0] },
      },
      in: {
        $let: {
          vars: {
            joined: {
              $trim: {
                input: {
                  $concat: [
                    { $ifNull: ['$$person.firstName', ''] },
                    ' ',
                    { $ifNull: ['$$person.lastName', ''] },
                  ],
                },
              },
            },
          },
          in: {
            $cond: [
              { $gt: [{ $strLenCP: '$$joined' }, 0] },
              '$$joined',
              { $ifNull: ['$$person.email', '—'] },
            ],
          },
        },
      },
    },
  });
  const statusExpr = {
    $switch: {
      branches: [
        { case: { $eq: [{ $toLower: text('$status') }, 'driver_is_on_the_way'] }, then: 'Driver is on the way' },
        { case: { $eq: [{ $toLower: text('$status') }, 'pending'] }, then: 'Available' },
        { case: { $in: [{ $toLower: text('$status') }, [...IN_PROGRESS]] }, then: 'In Progress' },
        { case: { $in: [{ $toLower: text('$status') }, [...COMPLETED]] }, then: 'Delivered' },
        {
          case: { $in: [{ $toLower: text('$status') }, ['cancelled', 'canceled']] },
          then: 'Cancelled',
        },
      ],
      default: { $ifNull: ['$status', '—'] },
    },
  };
  const orderVehicleExpr = {
    $switch: {
      branches: [
        { case: { $eq: ['$vehicleType', 'pickup'] }, then: 'Pickup' },
        { case: { $eq: ['$vehicleType', 'minivan'] }, then: 'Mini Van' },
        { case: { $eq: ['$vehicleType', 'van'] }, then: 'Van' },
        { case: { $eq: ['$vehicleType', 'truck'] }, then: 'Truck' },
        { case: { $eq: ['$vehicleType', 'small'] }, then: 'Small Van / Pickup' },
        { case: { $eq: ['$vehicleType', 'large'] }, then: 'Large Van (Transit)' },
      ],
      default: '—',
    },
  };
  const pipeline = [
    { $match: filter },
    {
      $lookup: {
        from: User.collection.collectionName,
        localField: 'customerId',
        foreignField: '_id',
        pipeline: [{ $project: { firstName: 1, lastName: 1, email: 1, phoneNumber: 1 } }],
        as: 'customerDoc',
      },
    },
    {
      $lookup: {
        from: User.collection.collectionName,
        localField: 'driverId',
        foreignField: '_id',
        pipeline: [{ $project: { firstName: 1, lastName: 1, email: 1, phoneNumber: 1, carModel: 1, plateNumber: 1 } }],
        as: 'driverDoc',
      },
    },
    {
      $addFields: {
        customerName: personName('$customerDoc'),
        driverName: {
          $let: {
            vars: { name: personName('$driverDoc') },
            in: {
              $cond: [
                {
                  $and: [{ $gt: [{ $size: '$driverDoc' }, 0] }, { $ne: ['$$name', '—'] }],
                },
                '$$name',
                'Unassigned',
              ],
            },
          },
        },
        createdLabel: createdExpr,
        statusLabel: statusExpr,
        vehicleLabel: orderVehicleExpr,
        floorsLabel: floorsExpr,
        priceLabel: { $concat: [twoDecimalExpr('$price'), ' ', text('$price')] },
        idLabel: {
          $concat: [
            text('$_id'),
            ' ',
            { $substrCP: [text('$_id'), { $max: [0, { $subtract: [{ $strLenCP: text('$_id') }, 8] }] }, 8] },
          ],
        },
      },
    },
  ];
  const textMatch = andExpr([
    containsExpr(
      {
        $concat: [
          text('$idLabel'),
          ' ',
          text('$customerName'),
          ' ',
          text('$driverName'),
          ' ',
          text('$pickupDistrict'),
          ' ',
          text('$pickupLocation.address'),
          ' ',
          text('$dropoffLocation.address'),
          ' ',
          text('$statusLabel'),
          ' ',
          text('$createdLabel'),
          ' ',
          text('$vehicleLabel'),
          ' ',
          text('$floorsLabel'),
          ' ',
          text('$priceLabel'),
        ],
      },
      query.search,
    ),
    containsExpr('$idLabel', query.id),
    containsExpr('$customerName', query.customer),
    containsExpr('$driverName', query.driver),
    containsExpr(
      { $concat: [text('$pickupDistrict'), ' ', text('$pickupLocation.address'), ' ', text('$dropoffLocation.address')] },
      textPlace,
    ),
    containsExpr(
      {
        $concat: [
          text('$floorsLabel'),
          ' ',
          { $cond: [{ $eq: ['$hasElevator', true] }, 'elevator', 'no lift'] },
        ],
      },
      query.logistics,
    ),
    containsExpr('$priceLabel', String(query.price ?? '').replace('€', '')),
    containsExpr('$createdLabel', query.created),
  ]);
  if (textMatch) pipeline.push({ $match: { $expr: textMatch } });
  pipeline.push({ $sort: { createdAt: -1, _id: -1 } });
  const page = await facetPage(TransportOrder, pipeline, offset, limit);
  return {
    ...page,
    items: page.items.map((doc) => {
      const customer = doc.customerDoc?.[0];
      const driver = doc.driverDoc?.[0];
      return shapeOrderDocForClient({
        ...doc,
        customerId: customer || doc.customerId,
        driverId: driver || null,
      });
    }),
    vehicles,
  };
}

module.exports = { listCustomers, listDrivers, listOrders, formatCreated };
