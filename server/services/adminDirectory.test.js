const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/User');
const TransportOrder = require('../models/TransportOrder');
const { listCustomers, listDrivers, listOrders, formatCreated } = require('./adminDirectory');

const MONGODB_URI = 'mongodb://127.0.0.1:27017/movingmate_admin_directory_test';

function place(address) {
  return { address, lat: 35.17, lng: 33.36 };
}

describe('admin directory paging', () => {
  before(async () => {
    await mongoose.connect(MONGODB_URI);
    await mongoose.connection.dropDatabase();

    const anna = await User.create({
      firstName: 'Anna',
      lastName: 'Alpha',
      email: 'anna.alpha@directory-test.local',
      phoneNumber: '+35788002001',
      password: 'hashed-password',
      role: 'customer',
      district: 'Nicosia',
      createdAt: new Date('2026-01-03T10:00:00.000Z'),
    });
    const boris = await User.create({
      firstName: 'Boris',
      lastName: 'Beta',
      email: 'boris.beta@directory-test.local',
      phoneNumber: '+35788002002',
      password: 'hashed-password',
      role: 'customer',
      district: 'Larnaca',
      isSuspended: true,
      createdAt: new Date('2026-01-02T10:00:00.000Z'),
    });
    await User.create({
      firstName: 'Cleo',
      lastName: 'Gamma',
      email: 'cleo.gamma@directory-test.local',
      phoneNumber: '+35788002003',
      password: 'hashed-password',
      role: 'customer',
      createdAt: new Date('2026-01-01T10:00:00.000Z'),
    });

    const online = await User.create({
      firstName: 'Nikos',
      lastName: 'Online',
      email: 'nikos.online@directory-test.local',
      phoneNumber: '+35788002011',
      password: 'hashed-password',
      role: 'driver',
      dateOfBirth: new Date('1990-01-01'),
      districts: ['Larnaca', 'Nicosia'],
      isVerified: true,
      verificationStatus: 'approved',
      carModel: 'Ford Transit',
      plateNumber: 'KAA 123',
      averageRating: 4.5,
      createdAt: new Date('2026-02-03T10:00:00.000Z'),
    });
    const busy = await User.create({
      firstName: 'Busy',
      lastName: 'Driver',
      email: 'busy.driver@directory-test.local',
      phoneNumber: '+35788002012',
      password: 'hashed-password',
      role: 'driver',
      dateOfBirth: new Date('1991-01-01'),
      district: 'Limassol',
      isVerified: true,
      verificationStatus: 'approved',
      createdAt: new Date('2026-02-02T10:00:00.000Z'),
    });
    await User.create({
      firstName: 'Suspended',
      lastName: 'Driver',
      email: 'suspended.driver@directory-test.local',
      phoneNumber: '+35788002013',
      password: 'hashed-password',
      role: 'driver',
      dateOfBirth: new Date('1992-01-01'),
      isVerified: true,
      verificationStatus: 'approved',
      isSuspended: true,
      createdAt: new Date('2026-02-01T10:00:00.000Z'),
    });

    const createdAt = new Date('2026-11-12T16:09:00.000Z');
    await TransportOrder.create({
      customerId: anna._id,
      pickupLocation: place('Alpha warehouse Nicosia'),
      dropoffLocation: place('Alpha drop'),
      pickupDistrict: 'Nicosia',
      price: 60.5,
      status: 'delivered',
      vehicleType: 'van',
      pickupFloor: '2',
      destinationFloor: '0',
      hasElevator: true,
      createdAt,
    });
    await TransportOrder.create({
      customerId: anna._id,
      driverId: online._id,
      pickupLocation: place('Second anna order'),
      dropoffLocation: place('Second drop'),
      pickupDistrict: 'Nicosia',
      price: 40,
      status: 'delivered',
      vehicleType: 'pickup',
      createdAt: new Date('2026-11-11T16:09:00.000Z'),
    });
    await TransportOrder.create({
      customerId: boris._id,
      driverId: busy._id,
      pickupLocation: place('Busy pickup Limassol'),
      dropoffLocation: place('Busy drop'),
      pickupDistrict: 'Limassol',
      price: 90,
      status: 'accepted',
      vehicleType: 'truck',
      createdAt: new Date('2026-11-10T16:09:00.000Z'),
    });
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('pages customers in the database and keeps column filters', async () => {
    const first = await listCustomers({ limit: 2, offset: 0 });
    assert.equal(first.total, 3);
    assert.equal(first.items.length, 2);
    assert.equal(first.items[0].fullName, 'Anna Alpha');
    assert.equal(first.items[0].totalOrders, 2);
    assert.equal(first.items[0].password, undefined);
    assert.deepEqual(first.districts, ['Larnaca', 'Nicosia']);

    const second = await listCustomers({ limit: 2, offset: 2 });
    assert.equal(second.items.length, 1);
    assert.equal(second.items[0].fullName, 'Cleo Gamma');
    assert.equal(second.items[0].districtLabel, '—');

    const suspended = await listCustomers({ status: 'Suspended' });
    assert.equal(suspended.total, 1);
    assert.equal(suspended.items[0].fullName, 'Boris Beta');

    const byOrders = await listCustomers({ orders: '2' });
    assert.equal(byOrders.total, 1);
    assert.equal(byOrders.items[0].email, 'anna.alpha@directory-test.local');

    const byContact = await listCustomers({ contact: '88002002' });
    assert.equal(byContact.total, 1);
    assert.equal(byContact.items[0].fullName, 'Boris Beta');
  });

  it('pages drivers with availability, trips, and district labels', async () => {
    const page = await listDrivers({ limit: 2, offset: 0 });
    assert.equal(page.total, 3);
    assert.equal(page.items.length, 2);
    assert.equal(page.items[0].password, undefined);
    assert.ok(page.districts.includes('Larnaca, Nicosia'));
    assert.ok(page.districts.includes('Limassol'));

    const busy = await listDrivers({ availability: 'Busy' });
    assert.equal(busy.total, 1);
    assert.equal(busy.items[0].fullName, 'Busy Driver');

    const online = await listDrivers({ district: 'Larnaca, Nicosia' });
    assert.equal(online.total, 1);
    assert.equal(online.items[0].completedTrips, 1);
    assert.equal(online.items[0].availabilityLabel, 'Online');
    assert.equal(online.items[0].ratingText, '4.5');
    assert.equal(online.items[0].vehicleLabel, 'Ford Transit · KAA 123');

    const suspended = await listDrivers({ availability: 'Suspended' });
    assert.equal(suspended.total, 1);
    assert.equal(suspended.items[0].districtLabel, 'All districts');
  });

  it('filters order text in the database and still pages the matches', async () => {
    const open = await listOrders({ limit: 2, offset: 0 });
    assert.equal(open.total, 3);
    assert.equal(open.items.length, 2);

    const alpha = await listOrders({ search: 'Alpha warehouse' });
    assert.equal(alpha.total, 1);
    assert.equal(alpha.items[0].pickupLocation.address, 'Alpha warehouse Nicosia');
    assert.equal(alpha.items[0].customer.fullName, 'Anna Alpha');

    const byPrice = await listOrders({ price: '€60.50' });
    assert.equal(byPrice.total, 1);

    const byCreated = await listOrders({ created: formatCreated(new Date('2026-11-12T16:09:00.000Z')).slice(0, 11) });
    assert.equal(byCreated.total, 1);

    const byDriver = await listOrders({ driver: 'Nikos' });
    assert.equal(byDriver.total, 1);
    assert.equal(byDriver.items[0].driver.fullName, 'Nikos Online');

    const unassigned = await listOrders({ driver: 'Unassigned' });
    assert.equal(unassigned.total, 1);
    assert.equal(unassigned.items[0].pickupLocation.address, 'Alpha warehouse Nicosia');

    const lift = await listOrders({ logistics: 'elevator' });
    assert.equal(lift.total, 1);

    const delivered = await listOrders({ status: 'Delivered', limit: 1, offset: 1 });
    assert.equal(delivered.total, 2);
    assert.equal(delivered.items.length, 1);
  });
});
