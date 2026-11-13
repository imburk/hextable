// A load check for the vendored Three.js (docs/specs/renderer.md, R10). Nothing in the game imports this file: only
// `SMOKE_ONLY=three npm run smoke` does, in the page, to prove the pinned library loads from vendor/ and works.
// It imports the library dynamically, so a normal page load never fetches vendor/.
// Returns what it saw; throws if the library cannot be loaded or draws nothing.
export async function checkThree() {
  const THREE = await import('./vendor/three/three.module.js');
  const { GLTFLoader } = await import('./vendor/three/GLTFLoader.js');
  const SkeletonUtils = await import('./vendor/three/SkeletonUtils.js');
  const BufferGeometryUtils = await import('./vendor/three/BufferGeometryUtils.js');
  if (typeof GLTFLoader !== 'function' || typeof new GLTFLoader().parse !== 'function') throw new Error('GLTFLoader did not load');
  if (typeof SkeletonUtils.clone !== 'function') throw new Error('SkeletonUtils.clone is missing');
  if (typeof BufferGeometryUtils.toTrianglesDrawMode !== 'function') throw new Error('BufferGeometryUtils did not load');

  const canvas = new OffscreenCanvas(64, 64);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  try {
    renderer.setSize(64, 64, false);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
    camera.position.set(1.5, 1.5, 2.5);
    camera.lookAt(0, 0, 0);
    const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    scene.add(cube);
    // Draw into a render target so the pixels can be read back: the middle of the frame must be the cube's red.
    const target = new THREE.WebGLRenderTarget(64, 64);
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    const px = new Uint8Array(4);
    renderer.readRenderTargetPixels(target, 32, 32, 1, 1, px);
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);                 // and one frame to the canvas itself
    target.dispose();
    if (!(px[0] > 200 && px[1] < 40 && px[2] < 40)) throw new Error(`the cube did not draw: middle pixel is ${Array.from(px)}`);
    return { revision: THREE.REVISION, webgl2: renderer.capabilities.isWebGL2, pixel: Array.from(px), drawCalls: renderer.info.render.calls, loaders: ['GLTFLoader', 'SkeletonUtils', 'BufferGeometryUtils'] };
  } finally { renderer.dispose(); }
}
