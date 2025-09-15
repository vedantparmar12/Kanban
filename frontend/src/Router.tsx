import { Routes, Route } from 'react-router-dom'

// Placeholder components until we have the actual ones
const Dashboard = () => <div>Dashboard</div>
const Login = () => <div>Login</div>

export const Router = () => {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/login" element={<Login />} />
    </Routes>
  )
}