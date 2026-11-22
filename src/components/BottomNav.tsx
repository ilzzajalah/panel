import React from 'react';
import { 
  Home, 
  Cpu, 
  Search, 
  Server, 
  ShieldCheck, 
  User, 
  LogOut 
} from 'lucide-react';

interface BottomNavProps {
  currentView: string;
  onNavigate: (view: string, param?: string) => void;
  user: any;
  onLogout: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentView,
  onNavigate,
  user,
  onLogout
}) => {
  const navItems = [
    { id: 'landing', label: 'Beranda', icon: Home },
    { id: 'configure', label: 'Order', icon: Cpu },
    { id: 'track', label: 'Lacak', icon: Search },
    ...(user ? [{ id: 'dashboard', label: 'Server', icon: Server }] : []),
    ...(user?.role === 'ADMIN' ? [{ id: 'admin', label: 'Admin', icon: ShieldCheck }] : []),
  ];

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-lg transition-all duration-300">
      <nav className="p-1.5 bg-neutral-900/90 backdrop-blur-xl border border-neutral-800/80 rounded-2xl shadow-2xl flex items-center justify-around gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex-1 py-2 px-2.5 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                isActive 
                  ? 'bg-white text-black font-semibold shadow-md scale-[1.02]' 
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-black' : 'text-neutral-400'}`} />
              <span className="text-[10px] tracking-tight">{item.label}</span>
            </button>
          );
        })}

        {user ? (
          <button
            onClick={onLogout}
            className="py-2 px-2.5 rounded-xl text-neutral-400 hover:text-rose-400 hover:bg-neutral-800/60 flex flex-col items-center justify-center gap-1 transition-colors"
            title="Keluar"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-[10px]">Keluar</span>
          </button>
        ) : (
          <button
            onClick={() => onNavigate('login')}
            className={`py-2 px-2.5 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
              currentView === 'login'
                ? 'bg-white text-black font-semibold shadow-md'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
            }`}
          >
            <User className="w-4 h-4" />
            <span className="text-[10px]">Masuk</span>
          </button>
        )}
      </nav>
    </div>
  );
};
