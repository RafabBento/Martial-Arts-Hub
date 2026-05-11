import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { setUser } = useAuth();
  const { toast } = useToast();
  const loginMutation = useLogin();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = (values: LoginFormValues) => {
    loginMutation.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          setUser(data.user);
          setLocation("/dashboard");
        },
        onError: (error: any) => {
          toast({
            variant: "destructive",
            title: "Login failed",
            description: error.message || "Invalid credentials. Please try again.",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-background dark text-foreground flex">
      {/* Left side - Image */}
      <div className="hidden lg:flex flex-1 relative bg-zinc-900 overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1555597673-b21d5c935865?q=80&w=1500&auto=format&fit=crop')] bg-cover bg-center opacity-40 mix-blend-luminosity"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-background to-transparent"></div>
        <div className="relative z-10 flex flex-col justify-end p-12 w-full">
          <div className="w-12 h-12 bg-primary text-primary-foreground font-black flex items-center justify-center rounded-sm text-2xl mb-6">
            A
          </div>
          <h2 className="text-5xl font-black uppercase tracking-tighter leading-tight text-white">
            Enter <br /> The Arena
          </h2>
          <p className="mt-4 text-zinc-400 text-lg max-w-md">
            Log in to track your progress, view your rankings, and manage your training sessions.
          </p>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex flex-col justify-center px-8 sm:px-16 lg:px-24">
        <div className="w-full max-w-sm mx-auto space-y-8">
          <div className="space-y-2 lg:hidden">
            <div className="w-10 h-10 bg-primary text-primary-foreground font-black flex items-center justify-center rounded-sm text-xl mb-6">
              A
            </div>
            <h1 className="text-3xl font-black uppercase tracking-tighter">Welcome Back</h1>
          </div>
          
          <h1 className="text-3xl font-black uppercase tracking-tighter hidden lg:block">Login</h1>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Email</FormLabel>
                    <FormControl>
                      <Input placeholder="fighter@academia.com" className="h-12 bg-card/50 border-border focus-visible:ring-primary" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" className="h-12 bg-card/50 border-border focus-visible:ring-primary" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full h-12 text-lg font-bold uppercase tracking-wide" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? "Authenticating..." : "Login"}
              </Button>
            </form>
          </Form>

          <p className="text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link href="/register" className="text-primary font-bold hover:underline">
              Join the club
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
