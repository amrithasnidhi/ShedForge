"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Edit, Trash2, Filter } from "lucide-react";
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

import { useAuth } from "@/components/auth-provider";
import {
    createRoom,
    deleteRoom,
    listRooms,
    updateRoom,
    type Room,
    type RoomType,
    type RoomUpdate,
} from "@/lib/academic-api";

export default function RoomsPage() {
    const { user } = useAuth();
    const canManage = user?.role === "admin" || user?.role === "scheduler";
    const [searchQuery, setSearchQuery] = useState("");
    const [buildingFilter, setBuildingFilter] = useState("all");
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [formValues, setFormValues] = useState({
        name: "",
        building: "",
        capacity: 30,
        type: "lecture" as RoomType,
        has_lab_equipment: false,
        has_projector: false,
    });
    const [editRoom, setEditRoom] = useState<Room | null>(null);
    const [editFormValues, setEditFormValues] = useState<RoomUpdate>({
        name: "",
        building: "",
        capacity: 30,
        type: "lecture",
        has_lab_equipment: false,
        has_projector: false,
    });

    useEffect(() => {
        const loadRooms = async () => {
            try {
                const data = await listRooms();
                setRooms(data);
            } catch (err) {
                const message = err instanceof Error ? err.message : "Unable to load rooms";
                setError(message);
            } finally {
                setIsLoading(false);
            }
        };
        void loadRooms();
    }, []);

    const handleAddRoom = async () => {
        setError(null);
        try {
            const created = await createRoom(formValues);
            setRooms((prev) => [...prev, created]);
            setIsAddDialogOpen(false);
            setFormValues({
                name: "",
                building: "",
                capacity: 30,
                type: "lecture",
                has_lab_equipment: false,
                has_projector: false,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to create room";
            setError(message);
        }
    };

    const handleDeleteRoom = async (roomId: string) => {
        if (!window.confirm("Delete this room?")) {
            return;
        }
        setError(null);
        try {
            await deleteRoom(roomId);
            setRooms((prev) => prev.filter((room) => room.id !== roomId));
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to delete room";
            setError(message);
        }
    };

    const openEditRoom = (room: Room) => {
        setEditRoom(room);
        setEditFormValues({
            name: room.name,
            building: room.building,
            capacity: room.capacity,
            type: room.type,
            has_lab_equipment: room.has_lab_equipment,
            has_projector: room.has_projector,
        });
        setIsEditDialogOpen(true);
    };

    const handleUpdateRoom = async () => {
        if (!editRoom) {
            return;
        }
        setError(null);
        try {
            const updated = await updateRoom(editRoom.id, editFormValues);
            setRooms((prev) => prev.map((room) => (room.id === updated.id ? updated : room)));
            setIsEditDialogOpen(false);
            setEditRoom(null);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to update room";
            setError(message);
        }
    };

    const filteredRooms = rooms.filter((room) => {
        const matchesSearch =
            room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            room.building.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesBuilding = buildingFilter === "all" || room.building === buildingFilter;
        return matchesSearch && matchesBuilding;
    });

    const buildings = useMemo(() => Array.from(new Set(rooms.map((r) => r.building))), [rooms]);
    const totalCapacity = rooms.reduce((sum, r) => sum + r.capacity, 0);
    const labRooms = rooms.filter((r) => r.has_lab_equipment).length;
    const avgCapacity = rooms.length ? Math.round(totalCapacity / rooms.length) : 0;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-foreground">Room Management</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage classroom inventory, capacity, and equipment
                    </p>
                </div>
                {canManage && (
                    <>
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
                                        <Input
                                            id="roomName"
                                           
                                            value={formValues.name}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({ ...prev, name: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="building">Building</Label>
                                        <Input
                                            id="building"
                                           
                                            value={formValues.building}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({ ...prev, building: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="roomType">Room Type</Label>
                                        <Select
                                            value={formValues.type}
                                            onValueChange={(value) =>
                                                setFormValues((prev) => ({ ...prev, type: value as RoomType }))
                                            }
                                        >
                                            <SelectTrigger id="roomType">
                                                <SelectValue/>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="lecture">Lecture</SelectItem>
                                                <SelectItem value="lab">Lab</SelectItem>
                                                <SelectItem value="seminar">Seminar</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="capacity">Capacity</Label>
                                        <Input
                                            id="capacity"
                                            type="number"
                                           
                                            value={formValues.capacity}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({
                                                    ...prev,
                                                    capacity: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <Checkbox
                                            id="labEquipment"
                                            checked={formValues.has_lab_equipment}
                                            onCheckedChange={(checked) =>
                                                setFormValues((prev) => ({
                                                    ...prev,
                                                    has_lab_equipment: Boolean(checked),
                                                }))
                                            }
                                        />
                                        <Label htmlFor="labEquipment" className="text-sm font-normal cursor-pointer">
                                            Has lab equipment
                                        </Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <Checkbox
                                            id="projector"
                                            checked={formValues.has_projector}
                                            onCheckedChange={(checked) =>
                                                setFormValues((prev) => ({
                                                    ...prev,
                                                    has_projector: Boolean(checked),
                                                }))
                                            }
                                        />
                                        <Label htmlFor="projector" className="text-sm font-normal cursor-pointer">
                                            Has projector
                                        </Label>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button onClick={handleAddRoom}>Add Room</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>

                        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                            <DialogContent className="sm:max-w-[500px]">
                                <DialogHeader>
                                    <DialogTitle>Edit Room</DialogTitle>
                                    <DialogDescription>Update room details and equipment</DialogDescription>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-roomName">Room Name/Number</Label>
                                        <Input
                                            id="edit-roomName"
                                            value={editFormValues.name ?? ""}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => ({ ...prev, name: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-building">Building</Label>
                                        <Input
                                            id="edit-building"
                                            value={editFormValues.building ?? ""}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => ({ ...prev, building: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-roomType">Room Type</Label>
                                        <Select
                                            value={(editFormValues.type ?? "lecture") as RoomType}
                                            onValueChange={(value) =>
                                                setEditFormValues((prev) => ({ ...prev, type: value as RoomType }))
                                            }
                                        >
                                            <SelectTrigger id="edit-roomType">
                                                <SelectValue/>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="lecture">Lecture</SelectItem>
                                                <SelectItem value="lab">Lab</SelectItem>
                                                <SelectItem value="seminar">Seminar</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="edit-capacity">Capacity</Label>
                                        <Input
                                            id="edit-capacity"
                                            type="number"
                                            value={editFormValues.capacity ?? 0}
                                            onChange={(event) =>
                                                setEditFormValues((prev) => ({
                                                    ...prev,
                                                    capacity: Number(event.target.value),
                                                }))
                                            }
                                        />
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <Checkbox
                                            id="edit-labEquipment"
                                            checked={Boolean(editFormValues.has_lab_equipment)}
                                            onCheckedChange={(checked) =>
                                                setEditFormValues((prev) => ({
                                                    ...prev,
                                                    has_lab_equipment: Boolean(checked),
                                                }))
                                            }
                                        />
                                        <Label htmlFor="edit-labEquipment" className="text-sm font-normal cursor-pointer">
                                            Has lab equipment
                                        </Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <Checkbox
                                            id="edit-projector"
                                            checked={Boolean(editFormValues.has_projector)}
                                            onCheckedChange={(checked) =>
                                                setEditFormValues((prev) => ({
                                                    ...prev,
                                                    has_projector: Boolean(checked),
                                                }))
                                            }
                                        />
                                        <Label htmlFor="edit-projector" className="text-sm font-normal cursor-pointer">
                                            Has projector
                                        </Label>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button onClick={handleUpdateRoom}>Save Changes</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </>
                )}
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Total Rooms</CardDescription>
                        <CardTitle className="text-3xl">{rooms.length}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardDescription>Total Capacity</CardDescription>
                        <CardTitle className="text-3xl">{totalCapacity}</CardTitle>
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

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Room Inventory</CardTitle>
                    <CardDescription>Search and filter rooms</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                               
                                className="pl-10"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <Select value={buildingFilter} onValueChange={setBuildingFilter}>
                            <SelectTrigger className="w-full sm:w-[200px]">
                                <Filter className="h-4 w-4 mr-2" />
                                <SelectValue/>
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

            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Room</TableHead>
                                    <TableHead>Building</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-right">Capacity</TableHead>
                                    <TableHead>Equipment</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                                            Loading rooms...
                                        </TableCell>
                                    </TableRow>
                                ) : filteredRooms.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                                            No rooms found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredRooms.map((room) => (
                                        <TableRow key={room.id}>
                                            <TableCell className="font-medium">{room.name}</TableCell>
                                            <TableCell>{room.building}</TableCell>
                                            <TableCell>
                                                <Badge variant="secondary" className="capitalize">
                                                    {room.type}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">{room.capacity}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-2">
                                                    {room.has_lab_equipment && (
                                                        <Badge variant="outline">Lab Equipment</Badge>
                                                    )}
                                                    {room.has_projector && <Badge variant="outline">Projector</Badge>}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {canManage && (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8"
                                                            onClick={() => openEditRoom(room)}
                                                        >
                                                            <Edit className="h-4 w-4" />
                                                            <span className="sr-only">Edit</span>
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-destructive"
                                                            onClick={() => handleDeleteRoom(room.id)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                            <span className="sr-only">Delete</span>
                                                        </Button>
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
