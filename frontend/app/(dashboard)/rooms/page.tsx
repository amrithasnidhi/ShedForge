"use client";

import { useState } from "react";
import { Plus, Search, Edit, Trash2, Filter, DoorOpen } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { roomData } from "@/lib/mock-data";

import { useAuth } from "@/components/auth-provider";

export default function RoomsPage() {
    const { user } = useAuth();
    const isAdmin = user?.role === "admin";
    const [searchQuery, setSearchQuery] = useState("");
    const [buildingFilter, setBuildingFilter] = useState("all");
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

    const filteredRooms = roomData.filter((room) => {
        const matchesSearch =
            room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            room.building.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesBuilding = buildingFilter === "all" || room.building === buildingFilter;
        return matchesSearch && matchesBuilding;
    });

    const buildings = Array.from(new Set(roomData.map((r) => r.building)));
    const totalCapacity = roomData.reduce((sum, r) => sum + r.capacity, 0);
    const labRooms = roomData.filter((r) => r.hasLabEquipment).length;
    const avgCapacity = Math.round(totalCapacity / roomData.length);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-foreground">Room Management</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage classroom inventory, capacity, and equipment
                    </p>
                </div>
                {!isAdmin && (
                    <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="h-4 w-4 mr-2" />
                                Add Room
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[500px]">
                            <DialogHeader>
                                <DialogTitle>Add New Room</DialogTitle>
                                <DialogDescription>
                                    Enter room details and equipment information
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="roomName">Room Name/Number</Label>
                                    <Input id="roomName" placeholder="A-101" />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="building">Building</Label>
                                    <Select>
                                        <SelectTrigger id="building">
                                            <SelectValue placeholder="Select building" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {buildings.map((building) => (
                                                <SelectItem key={building} value={building}>
                                                    {building}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="capacity">Capacity</Label>
                                    <Input id="capacity" type="number" placeholder="50" />
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="labEquipment" />
                                    <Label htmlFor="labEquipment" className="text-sm font-normal cursor-pointer">
                                        Has lab equipment
                                    </Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="projector" />
                                    <Label htmlFor="projector" className="text-sm font-normal cursor-pointer">
                                        Has projector
                                    </Label>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={() => setIsAddDialogOpen(false)}>Add Room</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Total Rooms</CardDescription>
                        <CardTitle className="text-3xl">{roomData.length}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Buildings</CardDescription>
                        <CardTitle className="text-3xl">{buildings.length}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Lab Rooms</CardDescription>
                        <CardTitle className="text-3xl">{labRooms}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Avg. Capacity</CardDescription>
                        <CardTitle className="text-3xl">{avgCapacity}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Filters and Search */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Room Inventory</CardTitle>
                    <CardDescription>Search and filter available rooms</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by room name or building..."
                                className="pl-10"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <Select value={buildingFilter} onValueChange={setBuildingFilter}>
                            <SelectTrigger className="w-full sm:w-[200px]">
                                <Filter className="h-4 w-4 mr-2" />
                                <SelectValue placeholder="All Buildings" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Buildings</SelectItem>
                                {buildings.map((building) => (
                                    <SelectItem key={building} value={building}>
                                        {building}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Rooms Table */}
            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Room</TableHead>
                                    <TableHead>Building</TableHead>
                                    <TableHead className="text-right">Capacity</TableHead>
                                    <TableHead>Equipment</TableHead>
                                    <TableHead className="text-right">Utilization</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredRooms.map((room) => {
                                    const utilization = room.utilization || Math.floor(Math.random() * 40) + 50;

                                    return (
                                        <TableRow key={room.id}>
                                            <TableCell className="font-medium">{room.name}</TableCell>
                                            <TableCell>{room.building}</TableCell>
                                            <TableCell className="text-right tabular-nums">{room.capacity}</TableCell>
                                            <TableCell>
                                                <div className="flex gap-2">
                                                    {room.hasLabEquipment && (
                                                        <Badge variant="outline" className="text-accent border-accent">
                                                            Lab
                                                        </Badge>
                                                    )}
                                                    {room.hasProjector && (
                                                        <Badge variant="outline" className="text-primary border-primary">
                                                            Projector
                                                        </Badge>
                                                    )}
                                                    {!room.hasLabEquipment && !room.hasProjector && (
                                                        <span className="text-sm text-muted-foreground">Standard</span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <span className="text-sm tabular-nums">{utilization}%</span>
                                                    {utilization > 80 ? (
                                                        <Badge variant="outline" className="text-destructive border-destructive">
                                                            High
                                                        </Badge>
                                                    ) : utilization > 60 ? (
                                                        <Badge variant="outline" className="text-warning border-warning">
                                                            Medium
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="text-success border-success">
                                                            Low
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {!isAdmin && (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                                            <Edit className="h-4 w-4" />
                                                            <span className="sr-only">Edit</span>
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                                                            <Trash2 className="h-4 w-4" />
                                                            <span className="sr-only">Delete</span>
                                                        </Button>
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
