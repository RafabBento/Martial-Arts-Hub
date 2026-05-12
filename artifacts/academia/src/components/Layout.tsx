import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../contexts/AuthContext";
import { useLogout } from "@workspace/api-client-react";
import {
  LogOut,
  Menu,
  X,
  LayoutDashboard,
  Users,
  CalendarDays,
  Camera,
  Trophy,
  User as UserIcon,
} from "lucide-react";
import { Button } from "./ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { user, setUser } = useAuth();
  const logoutMutation = useLogout();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        setUser(null);
        setLocation("/");
      },
    });
  };

  const navItems = [
    { name: "Painel", href: "/dashboard", icon: LayoutDashboard },
    { name: "Alunos", href: "/students", icon: Users },
    { name: "Sessões", href: "/sessions", icon: CalendarDays },
    { name: "Presenças", href: "/attendance", icon: Camera },
    { name: "Rankings", href: "/rankings", icon: Trophy },
  ];

  return (
    <div className="min-h-screen flex w-full bg-background dark text-foreground">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/80 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-card border-r border-border transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:h-screen flex flex-col ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-16 flex items-center justify-between px-6 border-b border-border">
          <Link href="/dashboard" className="flex items-center gap-2">
            <img src="/logo-thai.png" alt="Front Artes Marciais" className="h-[130px] w-[130px] object-contain shrink-0 -ml-6" />
            <span className="font-bold text-xl tracking-tight uppercase -ml-2 leading-tight">FRONT ARTES MARCIAIS</span>
          </Link>
          <button
            className="lg:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-3 rounded-md transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground font-medium shadow-sm shadow-primary/20"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon size={20} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <Link
            href="/profile"
            className="flex items-center gap-3 px-3 py-3 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-all mb-2"
          >
            <UserIcon size={20} />
            Perfil
          </Link>
          <Button
            variant="destructive"
            className="w-full justify-start gap-3"
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
          >
            <LogOut size={20} />
            Sair
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="h-16 flex items-center justify-between px-4 lg:px-8 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-4">
            <button
              className="lg:hidden text-muted-foreground hover:text-foreground"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={24} />
            </button>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-medium">{user?.name}</div>
                <div className="text-xs text-muted-foreground capitalize">{user?.role}</div>
              </div>
              <Link href="/profile">
                <div className="w-10 h-10 rounded-full bg-muted border border-border overflow-hidden cursor-pointer hover:border-primary transition-colors">
                  {user?.profilePhotoUrl ? (
                    <img src={user.profilePhotoUrl} alt={user.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary font-bold">
                      {user?.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              </Link>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-background p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
