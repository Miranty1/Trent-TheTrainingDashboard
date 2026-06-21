import { Routes, Route, Outlet } from 'react-router-dom'
import RequireAuth from './auth/RequireAuth'
import NavBar from './components/NavBar'
import Login from './pages/Login'
import Settings from './pages/Settings'
import Overview from './pages/Overview'
import ActivityDetail from './pages/ActivityDetail'
import { Trends, Gym } from './pages/stubs'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth><><NavBar /><Outlet /></></RequireAuth>}>
        <Route path="/" element={<Overview />} />
        <Route path="/activity/:id" element={<ActivityDetail />} />
        <Route path="/trends" element={<Trends />} />
        <Route path="/gym" element={<Gym />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
