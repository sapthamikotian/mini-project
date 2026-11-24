import { Routes, Route } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import Overview from "./pages/Overview";
import TransactionMonitor from "./pages/TransactionMonitor";
import TransactionDetail from "./pages/TransactionDetail";
import FraudDetection from "./pages/FraudDetection";
import NetworkAnalysis from "./pages/NetworkAnalysis";
import Alerts from "./pages/Alerts";
import Analytics from "./pages/Analytics";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Overview />} />
        <Route path="/transactions" element={<TransactionMonitor />} />
        <Route path="/transactions/:id" element={<TransactionDetail />} />
        <Route path="/fraud-detection" element={<FraudDetection />} />
        <Route path="/network" element={<NetworkAnalysis />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
