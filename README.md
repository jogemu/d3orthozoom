# D3OrthoZoom

An implementation of `d3.zoom()` for the `d3.geoOrthographic()` projection that zooms to the cursor/pointer. Performing rotations rather than panning minimizes distortions. In other implementations, this approach causes a loss of northing because certain points simply cannot be reached without rotating all axes. At least not without increasing scaling above the user's input. Understanding the minimum scaling was crucial to figure out the right rotation.

```html
<svg v-scope v-effect="d3orthozoom($el, $data)">
  <path :d="d('Sphere')" fill="lightblue"></path>
  <path :d="d('Graticule')" stroke="black" fill="none"></path>
</svg>

<script src="https://unpkg.com/d3orthozoom"></script>
<script src="https://unpkg.com/@jogemu/petite-vue" defer init></script>
```

Use `v-scope` to define or fetch data. Hide with `v-if` or modify with `@click`.

```html
<div v-scope="{visible: true, world: geoJSON, point: [0, 0]}">
  <svg v-effect="d3orthozoom($el, $data)">
    <path :d="d({type: 'Sphere'})" fill="lightblue"></path>
    <path :d="d(world)" fill="teal" v-if="visible"></path>
    <path :d="d({type: 'Graticule', stepMinor: [10, 10], stepMajor: [90, 360]})" stroke="black" fill="none"></path>
    <path :d="d({type: 'Circle', center: [0, 0], radius: 10})" fill="tomato"></path>
    <path :d="d(point)" v-effect="drag($el, point)" fill="purple"></path>
  </svg>
  <button @click="rotate=[0,0,0];scale=1">Reset Projection</button>
  <input type="checkbox" v-model="visible"> Hide layer
</div>

<script>var geoJSON = fetch('TODO.json').then(o => o.json()).catch(e => 'TODO handle error')</script>
<script src="https://unpkg.com/d3orthozoom"></script>
<script src="https://unpkg.com/@jogemu/petite-vue" defer init></script>
```

## Calculation

An orthographic projection with a scale of `1`, a translation of `[0, 0]` and rotation of `[0, 0, 0]` is projected onto the **unit circle**. To obtain the **equivalent coordinates** `x` and `y` for all other projections, scale, translation and rotation are inverted. The inverse projection of these coordinates returns the `lon`gitude and `lat`itude that is projected to that point.

In this calculation, `[lon, lat]` refers to the start position, while `[x, y]` refers to intermediate positions. The objective is to determine the **two-axis rotation** where the projection of `[lon, lat]` equals `[x, y]`. If `[x, y]` equals `[0, 0]` then the rotation is `[-lon, -lat, ]`.

The North Pole and South Pole are always along the angle determined by the fixed rotation axis. Hence, no two-axis rotation can move the poles to a position `[x, y]` that is not aligned with the rotation axis. More broadly, any point's pole distance (`x`) cannot exceed the cosine of its latitude. Conceptually rotate the nearest pole in the center to see why.

Any movement of `x` perpendicular to the axis reduces possible movement within the unit circle parallel to the axis. Going back to the start (center) has the length of the radius (hypotenuse = 1), which is already everything needed for the Pythagorean theorem.

```
reachX = max(cosd(lat), epsilon)
reachY = sqrt(1 - x*x)
```

The projection is increased above user input if necessary.

```
projection.scale(max(
  event.transform.k,  // user input
  sqrt(x*x + y*y),    // to prevent leaving globe
  abs(x) / reachX     // to prevent pole too far
))
```

The `asind` will go from `[-180, 180]` depending on how close the relative `x` value is to the maximum `x` value (pole too far). Fortunately, this also puts it on a vertical line with the cursor.

```
r0 = asind(x / reachX) - lon
```

In an intermediate step, the latitude of a point is calculated that is on the same height as the pointer and on the centered line that goes south from the North Pole.

A second step calculates the latitude of the pointer and adds or subtracts the previous value based on the hemisphere. Both steps must take into account the limitations imposed by the reach.

```
lat_ = -90 + asind(cosd(lat) * cosd(lon + r0) / reachY)
r1 = -asind(y / reachY) + lat_ * sign(lat)
```
