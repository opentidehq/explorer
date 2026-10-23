import type Sigma from "sigma";

export const MIN_CAMERA_RATIO = 0.06;
export const MAX_CAMERA_RATIO = 1.6;

/** Visible nodes' extent in framed coordinates, for camera moves. */
export function framedExtent(sigma: Sigma, ids: Iterable<string>) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let count = 0;
  for (const id of ids) {
    const data = sigma.getNodeDisplayData(id);
    if (!data || data.visibility === "hidden") continue;
    minX = Math.min(minX, data.x);
    maxX = Math.max(maxX, data.x);
    minY = Math.min(minY, data.y);
    maxY = Math.max(maxY, data.y);
    count += 1;
  }
  if (!count) return null;
  return { minX, maxX, minY, maxY, count };
}

/** Frame a set of nodes: centre the camera on them and zoom to fit with a margin. */
export function frameNodes(
  sigma: Sigma,
  ids: Iterable<string>,
  duration = 600,
) {
  const extent = framedExtent(sigma, ids);
  const camera = sigma.getCamera();
  if (!extent) {
    void camera.reset({ duration });
    return;
  }
  const span = Math.max(extent.maxX - extent.minX, extent.maxY - extent.minY);
  const ratio = Math.min(MAX_CAMERA_RATIO, Math.max(0.18, span * 1.35 + 0.04));
  void camera.animate(
    {
      x: (extent.minX + extent.maxX) / 2,
      y: (extent.minY + extent.maxY) / 2,
      ratio:
        extent.count === 1 ? Math.min(camera.getState().ratio, 0.35) : ratio,
    },
    { duration, easing: "quadraticInOut" },
  );
}
