import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen bg-background dark text-foreground flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('/bg-home.png')] bg-cover bg-center opacity-80"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-zinc-900/70 to-black"></div>
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

          <p className="text-sm font-bold uppercase tracking-[0.3em] text-zinc-500 pt-4">Front Artes Marciais</p>
        </div>
      </main>
    </div>
  );
}
