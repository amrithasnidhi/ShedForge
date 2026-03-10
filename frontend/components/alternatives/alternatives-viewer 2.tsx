"use client";

import { useMemo } from "react";
import { Check, ChevronRight, Trophy, AlertTriangle, Activity } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { GeneratedAlternative } from "@/lib/generator-api";

interface AlternativesViewerProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    alternatives: GeneratedAlternative[];
    currentRank: number;
    onSelect: (alternative: GeneratedAlternative) => void;
    bestFitness?: number;
}

export function AlternativesViewer({
    isOpen,
    onOpenChange,
    alternatives,
    currentRank,
    onSelect,
    bestFitness,
}: AlternativesViewerProps) {
    const sortedAlternatives = useMemo(() => {
        return [...alternatives].sort((a, b) => a.rank - b.rank);
    }, [alternatives]);

    if (!sortedAlternatives.length) return null;

    // Calculate relative fitness for progress bars (if bestFitness is provided)
    // Assuming higher fitness is better (closer to 0 usually in this system, but let's see)
    // Actually, fitness is negative in the genetic algorithm. Closer to 0 is better.
    // We can normalize against the best (max) fitness in the set.
    const maxFitness = Math.max(...alternatives.map((a) => a.fitness));
    const minFitness = Math.min(...alternatives.map((a) => a.fitness));
    const range = maxFitness - minFitness || 1;

    const getRelativeScore = (fitness: number) => {
        // Scale 0-100 based on range, where maxFitness is 100%
        if (range === 0) return 100;
        return 100 - ((maxFitness - fitness) / range) * 100;
        // Wait, if fitness is -100 (better) and min is -1000 (worse)
        // range = 900.
        // score = 100 - ((-100 - -100)/900)*100 = 100%
        // score for -1000 = 100 - ((-100 - -1000)/900)*100 = 100 - (900/900)*100 = 0%
        // This works for "Higher is better". 
        // In the backend, fitness = -((hard * 1000) + soft). So closer to 0 is indeed better (higher).
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Details & Comparison</DialogTitle>
                    <DialogDescription>
                        Compare generated timetable alternatives based on conflict count and constraint satisfaction.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex flex-col gap-4 py-4">
                    <div className="grid grid-cols-[60px_1fr_100px_100px_80px_100px] gap-4 px-4 py-2 font-medium text-sm text-muted-foreground border-b">
                        <div className="text-center">Rank</div>
                        <div>Overview</div>
                        <div className="text-center">Hard Conflicts</div>
                        <div className="text-center">Soft Penalty</div>
                        <div className="text-center">Fitness</div>
                        <div className="text-right">Action</div>
                    </div>

                    <ScrollArea className="flex-1">
                        <div className="flex flex-col gap-2 p-1">
                            {sortedAlternatives.map((alt) => {
                                const isCurrent = alt.rank === currentRank;
                                const isBest = alt.rank === 1; // Assuming rank 1 is best
                                const score = getRelativeScore(alt.fitness);

                                return (
                                    <Card
                                        key={alt.rank}
                                        className={`border-l-4 transition-colors ${isCurrent ? "border-l-primary bg-primary/5" : "border-l-transparent hover:bg-muted/50"
                                            }`}
                                    >
                                        <CardContent className="p-0">
                                            <div className="grid grid-cols-[60px_1fr_100px_100px_80px_100px] gap-4 items-center p-3">
                                                <div className="flex justify-center">
                                                    <div className={`flex h-8 w-8 items-center justify-center rounded-full font-bold text-sm ${isBest ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-muted text-muted-foreground"
                                                        }`}>
                                                        {alt.rank}
                                                    </div>
                                                </div>

                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold text-sm">Alternative #{alt.rank}</span>
                                                        {isBest && <Badge variant="secondary" className="text-[10px] h-5">Recommended</Badge>}
                                                        {isCurrent && <Badge className="text-[10px] h-5">Active</Badge>}
                                                    </div>
                                                    <Progress value={score} className="h-1.5 w-24" />
                                                </div>

                                                <div className="flex justify-center">
                                                    {alt.hard_conflicts === 0 ? (
                                                        <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                                                            <Check className="h-4 w-4" />
                                                            <span className="text-sm font-medium">Valid</span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-1.5 text-destructive">
                                                            <AlertTriangle className="h-4 w-4" />
                                                            <span className="text-sm font-medium">{alt.hard_conflicts}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="text-center font-mono text-sm text-muted-foreground">
                                                    {alt.soft_penalty.toFixed(1)}
                                                </div>

                                                <div className="text-center font-mono text-sm">
                                                    {alt.fitness.toFixed(0)}
                                                </div>

                                                <div className="flex justify-end">
                                                    <Button
                                                        size="sm"
                                                        variant={isCurrent ? "outline" : "default"}
                                                        disabled={isCurrent}
                                                        onClick={() => onSelect(alt)}
                                                        className="h-8"
                                                    >
                                                        {isCurrent ? "Viewing" : "View"}
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    </ScrollArea>
                </div>
            </DialogContent>
        </Dialog>
    );
}
