import { routeEndpointMarkerOptions, routeLineRendererOptions } from './route-map-markers';

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
});
