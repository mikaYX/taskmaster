import { Outlet } from "react-router-dom";

/** The application header already names the admin page; this only hosts it. */
export function AdminLayout() {
    return <Outlet />;
}
