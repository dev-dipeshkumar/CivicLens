import { Route, Routes } from "react-router-dom";
import { ToastProvider } from "./components/Toast";
import Landing from "./pages/Landing";
import Report from "./pages/Report";
import Dashboard from "./pages/Dashboard";

/** Root component. Router lives here; toast context wraps everything. */
export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/report" element={<Report />} />
        <Route path="/dashboard/*" element={<Dashboard />} />
      </Routes>
    </ToastProvider>
  );
}
