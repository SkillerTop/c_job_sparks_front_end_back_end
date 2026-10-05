import { SparkProvider } from '@/controllers/SparkContext';
import { AuthProvider } from '@/controllers/AuthContext';
import { ShopProvider } from '@/controllers/ShopContext';
import { AppRouter } from '@/app/AppRouter';
import { UserPreferencesProvider } from '@/controllers/UserPreferencesContext';

export default function App() {
  return (
    <AuthProvider>
      <UserPreferencesProvider>
        <SparkProvider>
          <ShopProvider>
            <AppRouter />
          </ShopProvider>
        </SparkProvider>
      </UserPreferencesProvider>
    </AuthProvider>
  );
}
