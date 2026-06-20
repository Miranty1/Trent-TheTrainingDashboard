import { NavLink } from 'react-router-dom'

const links = [
  ['/', 'Overview'], ['/trends', 'Trends'], ['/gym', 'Gym'], ['/settings', 'Settings'],
]

export default function NavBar() {
  return (
    <nav>
      {links.map(([to, label]) => (
        <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>
      ))}
    </nav>
  )
}
