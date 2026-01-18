"use client"

import * as React from "react"
import {
    LayoutDashboard,
    Zap,
    Globe,
    Activity,
    History,
    Settings,
    Command,
    HelpCircle,
    LogOut
} from "lucide-react"

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail,
    SidebarGroup,
    SidebarGroupLabel,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

const navMain = [
    {
        title: "Arbitrage",
        url: "/",
        icon: Zap,
    },
    {
        title: "Divergence",
        url: "/divergence",
        icon: Activity,
    },
    {
        title: "Topics",
        url: "/topics",
        icon: Command,
    },
    {
        title: "Trends",
        url: "/trends",
        icon: Globe,
    },
]

const navSecondary = [
    {
        title: "Settings",
        url: "/settings",
        icon: Settings,
    },
    {
        title: "Help",
        url: "/help",
        icon: HelpCircle,
    },
]

export function AppSidebar() {
    return (
        <Sidebar className="border-r border-border/10 bg-sidebar-background">
            <SidebarHeader className="p-4">
                <div className="flex items-center gap-3 px-2 py-1">
                    <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                        <Command className="h-4 w-4 text-primary-foreground" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold tracking-tight text-foreground/90">Arbiter</span>
                        <span className="text-[10px] text-muted-foreground font-mono">v1.2.0-beta</span>
                    </div>
                </div>
            </SidebarHeader>
            <SidebarContent className="px-3">
                <SidebarGroup>
                    <SidebarGroupLabel className="text-[10px] tracking-wider uppercase text-muted-foreground/50 font-medium px-4 mb-2">Platform</SidebarGroupLabel>
                    <SidebarMenu>
                        {navMain.map((item) => (
                            <SidebarMenuItem key={item.title}>
                                <SidebarMenuButton
                                    asChild
                                    tooltip={item.title}
                                    className="group flex gap-3 px-4 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-white/5 hover:text-white data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                                >
                                    <a href={item.url}>
                                        <item.icon className="h-4 w-4 opacity-70 group-hover:opacity-100" />
                                        <span>{item.title}</span>
                                    </a>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        ))}
                    </SidebarMenu>
                </SidebarGroup>

                <SidebarGroup className="mt-4">
                    <SidebarGroupLabel className="text-[10px] tracking-wider uppercase text-muted-foreground/50 font-medium px-4 mb-2">Analytics</SidebarGroupLabel>
                    <SidebarMenu>
                        {navSecondary.map((item) => (
                            <SidebarMenuItem key={item.title}>
                                <SidebarMenuButton
                                    asChild
                                    tooltip={item.title}
                                    className="group flex gap-3 px-4 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-white/5 hover:text-white"
                                >
                                    <a href={item.url}>
                                        <item.icon className="h-4 w-4 opacity-70 group-hover:opacity-100" />
                                        <span>{item.title}</span>
                                    </a>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        ))}
                    </SidebarMenu>
                </SidebarGroup>
            </SidebarContent>
            <SidebarFooter className="p-4 border-t border-white/5">
                <div className="flex items-center gap-3 px-2">
                    <Avatar className="h-8 w-8 border border-white/10">
                        <AvatarImage src="/placeholder-user.jpg" />
                        <AvatarFallback className="bg-white/10 text-xs">GS</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        <span className="text-xs font-medium text-foreground truncate">G. Suriya</span>
                        <span className="text-[10px] text-muted-foreground truncate">Free Plan</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-white hover:bg-white/5">
                        <Settings className="h-4 w-4" />
                    </Button>
                </div>
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    )
}
