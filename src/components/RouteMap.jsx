import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export default function RouteMap({ latlng }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current || !latlng?.length) return undefined
    const map = L.map(ref.current)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19,
    }).addTo(map)
    const line = L.polyline(latlng, { color: '#fc5200', weight: 4 }).addTo(map)
    map.fitBounds(line.getBounds(), { padding: [20, 20] })
    return () => map.remove()
  }, [latlng])
  return <div className="map" ref={ref} />
}
