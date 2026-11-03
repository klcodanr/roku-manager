import { QueryClient, QueryClientProvider } from "@tanstack/preact-query";
import { render } from "preact";
import { App } from "./App";
import "./app.css";

const queryClient = new QueryClient();

render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
  document.getElementById("app")!,
);
