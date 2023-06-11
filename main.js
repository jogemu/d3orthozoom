import { zoom, pointers } from 'd3'

const vec = {
  minus: (a, b) => a.map((c, i) => c - b[i]),
  norm: v => Math.sqrt(v.reduce((p, c) => p + c * c, 0)),
}
const arv = v => Object.assign(v, {
  norm: vec.norm(v),
  x: v[0],
  y: v[1],
})

const sind = deg => Math.sin(deg / 180 * Math.PI)
const cosd = deg => Math.cos(deg / 180 * Math.PI)
const asind = v => Math.asin(v) / Math.PI * 180
const abs = Math.abs, max = Math.max, sign = Math.sign, sqrt = Math.sqrt
const mod = (a, n) => (a % n + n) % n

// Scale and rotate (translate) orthographic projection while preserving a cardinal direction
// 
// projection   undefined behavior if not d3.geoOrthographic()
// svg          provide a function that returns a dom node (d3.select('#svg').node is a function)
// render       provide a function that updates all objects affected by projection change
// fallback     provide a function and return false if you want to handle the fallback yourself
//
// returns      a zoom() result with listeners attached (use d3.select('#globe').call(     ))
export function orthoZoom(projection, svg, render, fallback = () => true) {
  const pointer = event => pointers(event, svg())[0]
  const e2c = event => arv(vec.minus(pointer(event), projection.translate()))
  const scalemin = min => projection.scale(max(min, projection.scale()))

  let start, k, reach0
  return zoom()
    .on('start', event => {
      let [lon, lat] = start = projection.invert(pointer(event))
      k = projection.scale() / event.transform.k

      // if start on different side than center flip
      let [r0, r1, r2] = projection.rotate()
      if (abs(mod(lon + r0 + 180, 360) - 180) > 90) {
        projection.rotate([r0, r1, r2 + 180])
      }

      // The pole is mentally rotated in the center, then the distance of the latitude
      // is just the cosine.
      reach0 = cosd(abs(lat))
    })
    .on('zoom', event => {
      // Leaves globe if distance from pointer to projection center exceeds
      // scaling (globe radius). Increase scaling to ensure inverse projection.
      let v = e2c(event)

      // The scaling is increased beyond the user input if necessary
      projection.scale(max(
        k * event.transform.k,  // user input
        v.norm * 1.00001,       // to prevent leaving globe
      ))

      let r2 = projection.rotate()[2]
      v.x = v.x * cosd(r2) - v.y * sind(r2)
      if (reach0 < 1e-6) {
        if (fallback()) {
          console.error('The pointer was too close to a pole.')
          let [x, y] = projection(start)
          let [cx, cy] = projection.translate()
          v = e2c(event)
          projection.translate([2 * cx + v.x - x, 2 * cy + v.y - y])
          render()
        }
        return
      }
      // Preserving the northline demands that the point's horizontal distance
      // from the center cannot exceed the distance to the closest pole.
      // Thus increase scaling if necessary
      else scalemin(abs(v.x) / reach0 * 1.00001)
      

      let R = projection.scale()
      v = e2c(event)
      Object.assign(v, { // rotate if not northed
        x: v.x * cosd(r2) - v.y * sind(r2),
        y: v.x * sind(r2) + v.y * cosd(r2),
      })
      Object.assign(v, { // relative cooridnates
        xr: v.x / R,
        yr: v.y / R,
      })

      // The asind will go from [-180, 180] depending on how close the relative x value
      // is to the maximum x value (pole too far). Fortunately, this also puts it on a
      // vertical line with the cursor.
      let r0 = asind(v.xr / reach0) - start[0]

      let londiff = start[0] + r0
      // Since v.xr is already in the unit circle, one moves v.xr to the right, then up
      // until the circle is reached. Going back to the start (center) has the length
      // of the radius (hypotenuse = 1).
      let reach1 = sqrt(1 - (v.xr) ** 2)

      // Latitude of a point is calculated that is on the same height as the pointer and
      // on the centered line that goes south from the north pole.
      let r1 = -90 + asind(cosd(start[1]) * cosd(londiff) / reach1)
      // Calculates the latitude of the pointer and adds or subtracts the previous value
      // based on the hemisphere.
      r1 = -asind(v.yr / reach1) + r1 * sign(start[1])

      if (isNaN(r0) || isNaN(r1)) return console.error('NaN during rotation', r0, r1)
      projection.rotate([r0, r1, r2])

      render()
    })
}