export interface LatLng {
  lat: number;
  lng: number;
  address?: string;
}

export interface HopResult {
  fromAddress: string;
  toAddress: string;
  distanceMeters: number;
  distanceKm: number;
}

export interface RouteResult {
  hops: HopResult[];
  totalDistanceKm: number;
}

/**
 * Compute driving distances for a sequence of waypoints using Google Routes API v2.
 * Uses TRAFFIC_UNAWARE routing so distance is consistent regardless of time-of-day —
 * suitable as a reimbursement standard.
 *
 * Requires GOOGLE_MAPS_API_KEY env var.
 * Returns null if the API key is missing or the API fails.
 */
export async function computeTravelRoute(waypoints: LatLng[]): Promise<RouteResult | null> {
  if (waypoints.length < 2) return null;

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn('[travel-distance] NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set — using straight-line fallback');
    return computeStraightLineFallback(waypoints);
  }

  const origin = waypoints[0];
  const destination = waypoints[waypoints.length - 1];
  const intermediates = waypoints.slice(1, -1);

  const body: Record<string, unknown> = {
    origin: {
      location: { latLng: { latitude: origin.lat, longitude: origin.lng } },
    },
    destination: {
      location: { latLng: { latitude: destination.lat, longitude: destination.lng } },
    },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_UNAWARE',
    computeAlternativeRoutes: false,
  };

  if (intermediates.length > 0) {
    body.intermediates = intermediates.map((p) => ({
      location: { latLng: { latitude: p.lat, longitude: p.lng } },
    }));
  }

  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.legs.distanceMeters,routes.legs.startLocation,routes.legs.endLocation',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[travel-distance] Routes API error:', err);
      return computeStraightLineFallback(waypoints);
    }

    const data = await res.json() as {
      routes?: Array<{ legs: Array<{ distanceMeters: number }> }>;
    };

    const legs = data.routes?.[0]?.legs;
    if (!legs || legs.length === 0) return computeStraightLineFallback(waypoints);

    const hops: HopResult[] = legs.map((leg, i) => {
      const from = waypoints[i];
      const to = waypoints[i + 1];
      const distKm = Math.round((leg.distanceMeters / 1000) * 100) / 100;
      return {
        fromAddress: from.address || `(${from.lat.toFixed(5)}, ${from.lng.toFixed(5)})`,
        toAddress: to.address || `(${to.lat.toFixed(5)}, ${to.lng.toFixed(5)})`,
        distanceMeters: leg.distanceMeters,
        distanceKm: distKm,
      };
    });

    const totalDistanceKm = Math.round(hops.reduce((s, h) => s + h.distanceKm, 0) * 100) / 100;
    return { hops, totalDistanceKm };
  } catch (err) {
    console.error('[travel-distance] fetch error:', err);
    return computeStraightLineFallback(waypoints);
  }
}

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

function computeStraightLineFallback(waypoints: LatLng[]): RouteResult {
  const hops: HopResult[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];
    const distKm = Math.round(haversineKm(from, to) * 100) / 100;
    hops.push({
      fromAddress: from.address || `(${from.lat.toFixed(5)}, ${from.lng.toFixed(5)})`,
      toAddress: to.address || `(${to.lat.toFixed(5)}, ${to.lng.toFixed(5)})`,
      distanceMeters: Math.round(distKm * 1000),
      distanceKm: distKm,
    });
  }
  const totalDistanceKm = Math.round(hops.reduce((s, h) => s + h.distanceKm, 0) * 100) / 100;
  return { hops, totalDistanceKm };
}
