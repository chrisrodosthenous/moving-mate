import {
  routeEndpointMarkerOptions,
  routeLinePolylineOptions,
  routeLineRendererOptions,
  routeMetricsFromDirections,
  routePathFromDirections,
} from './route-map-markers';

describe('route-map-markers', () => {
  it('draws a labeled green circle for pickup and destination', () => {
    const pickup = routeEndpointMarkerOptions('pickup');
    const dropoff = routeEndpointMarkerOptions('dropoff');

    expect(pickup.label).toEqual(jasmine.objectContaining({ text: 'A' }));
    expect(dropoff.label).toEqual(jasmine.objectContaining({ text: 'B' }));
    expect(pickup.title).toBe('Pickup');
    expect(dropoff.title).toBe('Destination');

    const pickupIcon = pickup.icon as { path: string; fillColor: string };
    const dropoffIcon = dropoff.icon as { path: string; fillColor: string };
    expect(pickupIcon.path).toBe(dropoffIcon.path);
    expect(pickupIcon.fillColor).toBe('#22C55E');
    expect(dropoffIcon.fillColor).toBe('#22C55E');
    expect(String(pickupIcon.path)).not.toMatch(/^https?:/);
  });

  it('keeps Google route pins off while preserving the caller line style', () => {
    const options = routeLineRendererOptions({
      preserveViewport: true,
      polylineOptions: { strokeColor: '#22C55E', strokeWeight: 5 },
    });

    expect(options.suppressMarkers).toBe(true);
    expect(options.preserveViewport).toBe(true);
    expect(options.polylineOptions).toEqual({ strokeColor: '#22C55E', strokeWeight: 5 });
  });

  it('styles the road line in brand green', () => {
    expect(routeLinePolylineOptions()).toEqual(
      jasmine.objectContaining({
        strokeColor: '#22C55E',
        strokeOpacity: 1,
        strokeWeight: 5,
        clickable: false,
      }),
    );
  });

  it('builds the road from step paths and drops the repeated join', () => {
    const path = routePathFromDirections({
      routes: [
        {
          overview_path: [
            { lat: 0, lng: 0 },
            { lat: 9, lng: 9 },
          ],
          legs: [
            {
              steps: [
                {
                  path: [
                    { lat: () => 35.17, lng: () => 33.36 },
                    { lat: () => 35.16, lng: () => 33.37 },
                  ],
                },
                {
                  path: [
                    { lat: 35.16, lng: 33.37 },
                    { lat: 35.15, lng: 33.39 },
                    { lat: Number.NaN, lng: 33.4 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(path).toEqual([
      { lat: 35.17, lng: 33.36 },
      { lat: 35.16, lng: 33.37 },
      { lat: 35.15, lng: 33.39 },
    ]);
  });

  it('falls back to the overview path when steps have no coordinates', () => {
    const path = routePathFromDirections({
      routes: [
        {
          legs: [{ steps: [{ path: [] }] }],
          overview_path: {
            getArray: () => [
              { lat: 35.18, lng: 33.38 },
              { lat: 35.18, lng: 33.38 },
              { lat: 34.7, lng: 33.02 },
            ],
          },
        },
      ],
    });

    expect(path).toEqual([
      { lat: 35.18, lng: 33.38 },
      { lat: 34.7, lng: 33.02 },
    ]);
  });

  it('returns no road when directions are missing', () => {
    expect(routePathFromDirections(null)).toEqual([]);
    expect(routePathFromDirections({ routes: [] })).toEqual([]);
  });

  it('reads driving distance and duration from the first leg', () => {
    expect(
      routeMetricsFromDirections({
        routes: [
          {
            legs: [
              {
                distance: { value: 7534 },
                duration: { text: ' 12 mins ' },
              },
            ],
          },
        ],
      }),
    ).toEqual({ distanceKm: 7.534, durationText: '12 mins' });
  });

  it('returns no metrics when the driving distance is missing', () => {
    expect(routeMetricsFromDirections(null)).toBeNull();
    expect(routeMetricsFromDirections({ routes: [{ legs: [{ duration: { text: '1 min' } }] }] })).toBeNull();
    expect(
      routeMetricsFromDirections({ routes: [{ legs: [{ distance: { value: 0 }, duration: { text: '0 min' } }] }] }),
    ).toBeNull();
  });
});
