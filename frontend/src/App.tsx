import DashboardLayout from './components/layout/DashboardLayout';
import DashboardPage from './pages/DashboardPage';
import { FiltersProvider } from './context/FiltersContext';

export default function App() {
  return (
    <FiltersProvider>
      <DashboardLayout>
        <DashboardPage />
      </DashboardLayout>
    </FiltersProvider>
  );
}
