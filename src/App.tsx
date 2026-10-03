import { createBrowserRouter, RouterProvider } from "react-router";
import { routes } from "./router";

const router = createBrowserRouter(routes);

const App = () => {
  return <RouterProvider router={router} />;
};

export default App;
