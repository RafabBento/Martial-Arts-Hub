import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen bg-background dark text-foreground flex flex-col">
      <header className="absolute top-0 w-full p-6 flex justify-between items-center z-10">
        <div className="flex items-center gap-3">
          <img src="/logo-thai.png" alt="Front Artes Marciais" className="h-[130px] w-[130px] object-contain shrink-0 -ml-7 invert brightness-110 drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]" />
          <span className="font-bold text-2xl tracking-tighter uppercase -ml-2 leading-tight">Front Artes Marciais</span>
        </div>
        <div className="flex gap-4">
          <Link href="/login">
            <Button variant="ghost" className="font-semibold text-foreground hover:bg-white/10">ENTRAR</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-center opacity-20 mix-blend-luminosity"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background to-background"></div>
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSIvPjwvc3ZnPg==')] opacity-30 pointer-events-none"></div>

        <div className="relative z-10 max-w-4xl mx-auto text-center space-y-8">
          <h1 className="text-6xl md:text-8xl font-black uppercase tracking-tighter leading-[0.9]">
            Disciplina <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-red-800">É Tudo</span>
          </h1>

          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto font-medium">
            A plataforma completa para academias de artes marciais. Controle de Muay Thai & Jiu-Jitsu, rankings e presença por reconhecimento facial.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
            <Link href="/register">
              <Button size="lg" className="w-full sm:w-auto h-14 px-8 text-lg font-bold uppercase tracking-wide">
                Cadastrar-se
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="w-full sm:w-auto h-14 px-8 text-lg font-bold uppercase tracking-wide border-2">
                Entrar
              </Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
