import type { ProductTourId } from '../../shared/productTour';

export const PRODUCT_TOUR_DEMO_MARKER_KIND = 'aidlc-product-tour-demo';

export interface ProductTourDemoMarker {
  kind: typeof PRODUCT_TOUR_DEMO_MARKER_KIND;
  version: 1;
  tourId: ProductTourId;
}

/** Strict parser so an unrelated pre-existing directory is never reused as a demo. */
export function parseDemoMarker(value: unknown): ProductTourDemoMarker | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const marker = value as Partial<ProductTourDemoMarker>;
  if (marker.kind !== PRODUCT_TOUR_DEMO_MARKER_KIND || marker.version !== 1) return undefined;
  if (marker.tourId !== 'lifecycle-basics' && marker.tourId !== 'safe-scan' && marker.tourId !== 'rejection-recovery') return undefined;
  return marker as ProductTourDemoMarker;
}
