import { zoom, pointers, select, drag, geoOrthographic, geoPath, geoGraticule, geoCircle } from 'd3'

// Scale and rotate orthographic projections while preserving a bidirectional azimuth.
// This function is intended to be a reactive effect. (reevaluate on property change)
//
// First parameter is the html element for the zoom and resize events.
// Second parameter is a (reactive) object
//   where the function d will be defined and updated which converts geoJSON to svg path
//   furthermore projection properties (can be preset and are updated)
//     * rotation: [deg, deg, deg] where deg is angle in degrees
//     * scale: [IR+] where IR+ is a positive real number (relative to extent)
//     * translation: [IR, IR] where IR is a real number (relative to extent)
//     * extent: [IR+, IR+] where IR+ is a positive real number in pixels
//     * zoom: see d3.zoom()
//     * projection: see d3.geoOrthographic()
// Third parameter is epsilon to avoid division by zero
export function d3orthozoom(svg, d, epsilon=1e-6) {
  d.rotate ??= [0, 0, 0]
  d.scale ??= .96
  d.translate ??= [0, 0]
  if(!d.extent) resizeObserver(() => d.extent = [svg.clientWidth, svg.clientHeight]).observe(svg)
  d.forcedScale ??= 1
  d.projection = geoOrthographic().clipExtent([[0, 0], d.extent]).rotate(d.rotate).translate(center(d)).scale(radius(d) * d.forcedScale)
  d.d = geoPath2(d.projection)
  if(!d.zoom) {
    const pointer = event => vector(pointers(event, svg)[0])
    let lon, lat, reachX, af={}
    d.zoom = zoom().on('start', event => {
      if(!event.sourceEvent) return

      // A zoom event starts when the user clicks on some position.
      // Store the coordinates by inverting the projection.
      [lon, lat] = d.projection.invert(pointer(event))

      // Conceptually rotate the nearest pole in the center.
      // Any point's pole distance is the cosine of its latitude.
      // This only gets shorter as the pole leaves the center.
      // If the pointer is farther away, forced scaling is necessary.
      // Used as a divisor, increased to epsilon to avoid zero.
      reachX = max(cosd(lat), epsilon)

      // Zoom on the opposite side of the globe flips the globe upside down.
      // Which is equivalent to adding 180 degrees to the third rotation axis.
      // Calculation for rotation will not flip if the inverse is done.
      if(abs(anglediff(lon, -d.rotate[0])) > 90) {
        d.rotate[2] -= 180
        d.rotate[0] -= 180 // Do not flip a second time
      }

      d.scale *= d.forcedScale
      d.forcedScale = 1
    }).on('zoom', event => animationFrame(() => {
      if(!event.sourceEvent) return

      // k is how much the user wants to scale the globe.
      d.scale = event.transform.k

      // Where does the user point on the unit circle of the globe?
      let [x, y] = pointer(event).minus(center(d)).rotate(-d.rotate[2]).times(1/radius(d))

      d.forcedScale = max(
        sqrt(x*x + y*y),  // do not exceed globe
        abs(x) / reachX,  // do not exceed reach from nearest pole
        1                 // do not scale if not necessary
      )
      x /= d.forcedScale
      y /= d.forcedScale

      // The asind will go from [-180, 180] depending on how close the relative x value
      // is to the maximum x value (pole too far). Fortunately, this also puts it on a
      // vertical line with the pointer.
      let r0 = d.rotate[0] = asind(x / reachX) - lon

      // Move x to the right on the unit circle, then up until the circle is reached.
      // Going back to the start (center) has the length of the radius (hypotenuse = 1).
      let reachY = sqrt(1 - x*x)

      // Calculate the latitude of a point that is
      // * on the same height as the pointer and
      // * on the centered line that goes south from the north pole.
      let lat_ = -90 + asind(cosd(lat) * cosd(lon + r0) / reachY)
      // Add or subtract the point's latitude from the pointer's latitude.
      // Based on the hemisphere because lat_ may depend on the opposite pole.
      d.rotate[1] = -asind(y / reachY) + lat_ * sign(lat)
    }, af))
    select(svg).call(d.zoom).on('mousewheel.zoom', null)
    d.drag = (path, o) => select(path).call(drag().on('drag', event => Object.assign(o, d.projection.invert(pointer(event)))))
  }
  if(!svg.__transition) d.zoom.scaleTo(select(svg), d.scale)
}

// apply f, delayed if busy, cancels pending f
function animationFrame(f, af={}) {
  cancelAnimationFrame(af.id)
  af.id = requestAnimationFrame(f)
}

// apply f, reapply on resize, delayed if busy
function resizeObserver(f, af={}) {
  f()
  return new ResizeObserver(() => animationFrame(f, af))
}

const radius = d => Math.min(...d.extent)/2 * d.scale
const center = d => d.extent.map((i, k) => i/2 + d.translate[k] * radius(d) * d.forcedScale)

// geoPath with some additional features supported
function geoPath2(p) {
  const path = geoPath(p)
  return o => path(geoJson(o))
}

// One-dimensional array is a point, two-dimensional array is a line,
// three-dimensional array is a polygon, four-dimensional array is a GeometryCollection.
// Add support for Circle and Graticule, similar to Sphere.
function geoJson(o) {
  if(Array.isArray(o)) o = {
    type: Array.isArray(o[0]) ? Array.isArray(o[0][0]) ? Array.isArray(o[0][0][0]) ? 'GeometryCollection' : 'Polygon' : 'LineString' : 'Point',
    coordinates: o
  }
  if(!o?.type) o = { type: o }
  if(o.type == 'GeometryCollection') o.coordinates = o.coordinates.map(geoJson)
  const opts = g => Object.keys(g).filter(k => o[k]).forEach(k => g[k](o[k]))
  if(o.type == 'Circle') {
    let circle = geoCircle()
    opts(circle)
    return circle()
  }
  if(o.type == 'Graticule') {
    let graticule = geoGraticule()
    opts(graticule)
    return (o.lines ? graticule.lines : o.outline ? graticule.outline : graticule)()
  }
  return o
}

function vector(v) {
  return Object.assign(v, {
    minus: w => vector([
      v[0] - w[0],
      v[1] - w[1]
    ]), rotate: w => vector([
      v[0] * cosd(-w) - v[1] * sind(-w),
      v[0] * sind(-w) + v[1] * cosd(-w)
    ]), times: w => vector([
      v[0] * w,
      v[1] * w
    ])
  })
}

const mod = (a, n) => (a % n + n) % n
function anglediff(a, b) {
  return mod(a - b + 180, 360) - 180
}

const sind = deg => Math.sin(deg / 180 * Math.PI)
const cosd = deg => Math.cos(deg / 180 * Math.PI)
const asind = v => Math.asin(v / max(1, abs(v))) / Math.PI * 180
const abs = Math.abs, max = Math.max, sign = Math.sign, sqrt = Math.sqrt

globalThis.d3orthozoom = d3orthozoom
