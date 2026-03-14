import { Outlet } from "react-router-dom";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function AdminLayout() {
    return (
        <div className="flex flex-col h-full w-full">
            <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
                <div className="flex items-center gap-2 px-4">
                    <SidebarTrigger className="-ml-1" />
                    <Separator orientation="vertical" className="mr-2 h-4" />
                    <h2 className="text-sm font-semibold text-muted-foreground tracking-tight">
                        Administration
                    </h2>
                </div>
            </header>
            <div className="flex-1 p-6 overflow-auto">
                <Outlet />
            </div>
        </div>
    );
}
