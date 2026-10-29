// Hairlines of a fixed width in CSS pixels at any distance (three's fat lines): drainage on the relief and the
// outlines of the sheets. Every line is a list of model-space points; nothing here invents a point.

import { Color } from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import type { Vec3 } from "../frame";

export interface LineOptions {
  color: string;
  /** CSS pixels. */
  width?: number;
  opacity?: number;
  closed?: boolean;
  renderOrder?: number;
  depthTest?: boolean;
}

/** Makes fat lines for one stage and keeps their materials' resolution in step with its canvas. */
export class LineKit {
  private readonly materials = new Set<LineMaterial>();
  private size: [number, number] = [1, 1];

  resize(width: number, height: number): void {
    this.size = [width, height];
    for (const m of this.materials) m.resolution.set(width, height);
  }

  lines(polylines: readonly (readonly Vec3[])[], o: LineOptions): LineSegments2 {
    const seg: number[] = [];
    for (const pl of polylines) {
      const n = pl.length;
      const m = o.closed ? n : n - 1;
      for (let i = 0; i < m; i++) {
        const a = pl[i];
        const b = pl[(i + 1) % n];
        if (a && b) seg.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      }
    }
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(seg);
    const opacity = o.opacity ?? 1;
    const material = new LineMaterial({
      color: new Color(o.color),
      linewidth: o.width ?? 1,
      transparent: opacity < 1,
      opacity,
      depthTest: o.depthTest ?? true,
      depthWrite: false,
      worldUnits: false,
    });
    material.resolution.set(...this.size);
    this.materials.add(material);
    const line = new LineSegments2(geometry, material);
    line.frustumCulled = false;
    line.renderOrder = o.renderOrder ?? 0;
    return line;
  }
}
