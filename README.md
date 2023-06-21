# D3OrthoZoom

This implements `d3.zoom()` for the `d3.geoOrthographic()` projection while preserving a cardinal direction that can only be reversed. Transformations are carried out through rotations, which, with the addition of scaling, also enables interactive projections that can be viewed from all sides.

In existing implementations, whether or not with [d3.js](https://d3js.org/), either the position under the cursor moves or the projection is rotated in all three axes, resulting in a loss of northing. There are limitations in preventing these unwanted effects, but this implementation copes with those limitations by embracing them. Simply put, every time this implementation encounters an undefined position it scales up the projection above what `d3.zoom()` asked for.

## Getting started

After installing [Node.js](https://nodejs.org) you can use npm to add d3orthozoom in your project folder.

```
npm install d3orthozoom
```

Import and use d3orthozoom like this.

```
import * as d3 from 'd3'
import { orthoZoom } from 'd3orthozoom'

const projection = d3.geoOrthographic()
const svg = d3.select('#svg')
const globe = d3.select('#globe')
// structure <svg id="svg"><g id="globe"></g></svg>
// <g> will prevent call of zoom outside globe
// add projected data only to #globe

function render() {
  // will be called after scaling and rotation is done
}

const zoom = orthoZoom(projection, svg.node, render)
// zoom.scale(2)
d3.select('#globe').call(zoom).on('mousewheel.zoom', null)
```

## Calculation

The vector `v` is introduced with the pointer's absolute (`v.x`, `v.y`) and relative (`v.xr`, `v.yr`) distance from the center of the projection. Relative values are 0 at the center and absolute 1 at radius. `lon` and `lat` are determined by inverse projection of the pointer position at zoom start.

Reach is the maximum longitudinal and latitudinal distance that the point under the pointer can be moved away from the rotation center divided by 90. Each distance is symmetrical. For the longitude the pole is mentally rotated in the center, then the farthest distance from the pole is the cosine of the latitude.

The Pythagorean theorem is used for the latitude. Since v.xr is already in the unit circle, one moves v.xr to the right, then the unknown distance up until the circle is reached. Going back to the start (center) has the length of the radius (hypotenuse = 1).

These variables remain relevant until the end.

```
reach.lon = cosd(abs(lat))
reach.lat = Math.sqrt(1 - v.xr ** 2)
```

The projection is increased above user input if necessary.

```
projection.scale(max(
  k * event.transform.k,  // user input
  v.norm,                 // to prevent leaving globe
  abs(v.x) / reach.lon    // to prevent pole too far
))
```

The asind will go from [-180, 180] depending on how close the relative x value is to the maximum x value (pole too far). Fortunately, this also puts it on a vertical line with the cursor.

```
r0 = asind(v.xr / reach.lon) - lon
```

Next the latitude of a point is calculated that is on the same height as the pointer and on the centered line that goes south from the north pole.

A second step calculates the latitude of the pointer and adds or subtracts the previous value based on the hemisphere. Both steps must take into account the limitations imposed by the reach.

```
r1 = -90 + asind(cosd(lat) * cosd(lon + r0) / reach.lat)
r1 = -asind(v.yr / reach.lat) + r1 * sign(lat)
```

## Intuitive interaction

For flat projections, it is common that the point under the cursor remains under it during the zooming. For pinch-to-zoom (multi-touch) this point is in the center of the touch events. Ideally, the points under the fingers follow the fingers as if the fingers were physically pulling them apart or squeezing them. For the latter, it is particularly unintuitive if points increasingly deviate from their expected positions.

However, the best thing to do is to just try it out. Write down anything that catches your eye and seems unintuitive. Especially when comparing it to a different map, the differences should be obvious.

## Room for improvement

If the pointer is very close or on the axis of the cardinal direction then not even greatly exaggerated zoom can correct a movement. Let me know about your thoughts on what the tolerances should be. Is shifting the axis intuitive or is it better to simply ignore movements that cannot be performed?

When zooming out, it is unintuitive that the projection stops getting smaller, if the point would be too far from the pole. Direct feedback is missing, especially if the zooming starts already at the limit. An animation that briefly enlarges the projection and then reduces it could give visual feedback. This is not included because this might interfere with your d3 code. On the other hand, repeated/continuous zooming could just translate the projection.
