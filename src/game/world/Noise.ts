export function hash(x: number, z: number) {
    // deterministic pseudo-random in [0,1)
    const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
    return s - Math.floor(s);
  }
  
  export function smoothNoise(x: number, z: number) {
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    const xf = x - xi;
    const zf = z - zi;
  
    const h00 = hash(xi, zi);
    const h10 = hash(xi + 1, zi);
    const h01 = hash(xi, zi + 1);
    const h11 = hash(xi + 1, zi + 1);
  
    const u = xf * xf * (3 - 2 * xf);
    const v = zf * zf * (3 - 2 * zf);
  
    return (
      h00 * (1 - u) * (1 - v) +
      h10 * u * (1 - v) +
      h01 * (1 - u) * v +
      h11 * u * v
    );
  }