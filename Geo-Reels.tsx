import { createFileRoute } from "@tanstack/react-router";
import { lazy, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { ChevronDown, Download, List, Map as MapIcon, Plus, Search, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CaptionDetect } from "@/components/reel/CaptionDetect";
import { ClientOnly } from "@/components/reel/ClientOnly";
import { FilterPills } from "@/components/reel/FilterPills";
import { ImportDropzone } from "@/components/reel/ImportDropzone";
import { ReelCard } from "@/components/reel/ReelCard";
import { ReelDrawer } from "@/components/reel/ReelDrawer";
import { ReelForm, emptyDraft, type ReelDraft } from "@/components/reel/ReelForm";
import { useReels } from "@/hooks/useReels";
import type { ImportCandidate } from "@/lib/instagram-import";
import {
  CATEGORIES,
  REGIONS,
  REGION_LABELS,
  guessRegion,
  matchesSearch,
  newId,
  reelListSchema,
  sanitiseReelUrl,
  type Category,
  type Reel,
  type Region,
} from "@/lib/reels";
import { cn } from "@/lib/utils";

const ReelMap = lazy(() => import("@/components/reel/ReelMap"));

const viewStateSchema = z.object({
  filter: z.union([z.enum(REGIONS), z.literal("all")]),
  collapsed: z.array(z.enum(REGIONS)),
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Reel-Karte – deine gespeicherten Reels auf einer Karte" },
      {
        name: "description",
        content:
          "Importiere deine gespeicherten Instagram-Reels und sieh sie als Pins auf einer Karte. Mit Kategorien, Suche und Ortsangaben – auf allen Geräten synchron.",
      },
      { property: "og:title", content: "Reel-Karte – deine gespeicherten Reels auf einer Karte" },
      {
        property: "og:description",
        content:
          "Importiere deine gespeicherten Instagram-Reels und sieh sie als Pins auf einer Karte. Auf allen Geräten synchron.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { reels, addReels, updateReel, removeReel, replaceAll } = useReels();

  const [search, setSearch] = useState("");
  const [activeCategories, setActiveCategories] = useState<Set<Category>>(new Set(CATEGORIES));
  const [selected, setSelected] = useState<Reel | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState<ReelDraft>(emptyDraft());
  const [importOpen, setImportOpen] = useState(false);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [quickUrl, setQuickUrl] = useState("");
  const [regionFilter, setRegionFilter] = useState<Region | "all">("all");
  const [collapsed, setCollapsed] = useState<Set<Region>>(new Set());
  const viewLoaded = useRef(false);

  // Restore the saved region view once in the browser (SSR has no localStorage).
  useEffect(() => {
    viewLoaded.current = true;
    try {
      const saved = window.localStorage.getItem("reel-karte:region-view:v1");
      if (!saved) return;
      const parsed = viewStateSchema.safeParse(JSON.parse(saved));
      if (!parsed.success) return;
      setRegionFilter(parsed.data.filter);
      setCollapsed(new Set(parsed.data.collapsed));
    } catch {
      // Ungültige oder fehlende Daten einfach ignorieren.
    }
  }, []);

  useEffect(() => {
    if (!viewLoaded.current) return;
    window.localStorage.setItem(
      "reel-karte:region-view:v1",
      JSON.stringify({ filter: regionFilter, collapsed: [...collapsed] }),
    );
  }, [regionFilter, collapsed]);
  const [mobileView, setMobileView] = useState<"list" | "map">("map");
  const backupInputRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    const base = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
    for (const reel of reels) base[reel.category] += 1;
    return base;
  }, [reels]);

  const visible = useMemo(
    () =>
      reels.filter(
        (reel) =>
          activeCategories.has(reel.category) &&
          (regionFilter === "all" || reel.region === regionFilter) &&
          matchesSearch(reel, search),
      ),
    [reels, activeCategories, regionFilter, search],
  );

  const grouped = useMemo(
    () =>
      REGIONS.map((region) => ({
        region,
        items: visible.filter((reel) => reel.region === region),
      })).filter((group) => group.items.length > 0),
    [visible],
  );

  function toggleRegion(region: Region) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(region)) next.delete(region);
      else next.add(region);
      return next;
    });
  }

  function toggleCategory(category: Category) {
    setActiveCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function openReel(reel: Reel) {
    setSelected(reel);
    setDrawerOpen(true);
  }

  function openAdd(partial?: Partial<ReelDraft>) {
    setAddDraft(emptyDraft(partial));
    setAddOpen(true);
  }

  function handleCandidates(found: ImportCandidate[]) {
    if (found.length === 0) return;
    setCandidates(found);
    setChecked(new Set(found.map((c) => c.url)));
    setImportOpen(true);
  }

  function confirmImport() {
    const chosen = candidates.filter((c) => checked.has(c.url));
    const newReels: Reel[] = chosen.map((c) => ({
      id: newId(),
      url: c.url,
      title: c.title,
      caption: c.caption,
      note: "",
      category: "sehenswuerdigkeiten",
      region: guessRegion(c.placeGuess),
      placeName: c.placeGuess,
      lat: null,
      lng: null,
      createdAt: Date.now(),
    }));
    const added = addReels(newReels);
    setImportOpen(false);
    setCandidates([]);
    toast.success(
      added > 0
        ? `${added} Reel${added === 1 ? "" : "s"} übernommen. Zeit, Orte zu verteilen.`
        : "Diese Reels waren schon alle auf der Karte.",
    );
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(reels, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `reel-karte-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importBackup(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    try {
      const parsed = reelListSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) throw new Error("invalid");
      replaceAll(parsed.data);
      toast.success(`Backup geladen – ${parsed.data.length} Pins sind zurück.`);
    } catch {
      toast.error("Das war leider keine gültige Backup-Datei.");
    }
  }

  const listPanel = (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 sm:p-6">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Suche nach Titel, Ort oder Bildunterschrift"
          className="rounded-xl pl-9"
        />
      </div>

      <FilterPills active={activeCategories} counts={counts} onToggle={toggleCategory} />

      <Select value={regionFilter} onValueChange={(value) => setRegionFilter(value as Region | "all")}>
        <SelectTrigger className="rounded-xl" aria-label="Region wählen">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="rounded-xl">
          <SelectItem value="all">Alle Regionen</SelectItem>
          {REGIONS.map((region) => (
            <SelectItem key={region} value={region}>
              {REGION_LABELS[region]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex gap-2">
        <Input
          value={quickUrl}
          inputMode="url"
          placeholder="Reel-Link einfügen …"
          className="rounded-xl"
          onChange={(event) => {
            const value = event.target.value;
            // A complete Instagram link (typed or pasted) opens the popup straight away.
            if (sanitiseReelUrl(value)) {
              setQuickUrl("");
              openAdd({ url: value.trim() });
              return;
            }
            setQuickUrl(value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && quickUrl.trim()) {
              openAdd({ url: quickUrl.trim() });
              setQuickUrl("");
            }
          }}
        />
        <Button
          className="shrink-0 rounded-xl"
          onClick={() => {
            openAdd(quickUrl.trim() ? { url: quickUrl.trim() } : undefined);
            setQuickUrl("");
          }}
        >
          <Plus className="size-4" />
          Reel-Link
        </Button>
      </div>

      <CaptionDetect
        onCreate={(reel) => {
          const added = addReels([reel]);
          toast.success(
            added > 0 ? "Pin gesetzt – der Ort war schneller gefunden als gedacht." : "Diesen Link gibt es schon.",
          );
        }}
      />

      <ImportDropzone onCandidates={handleCandidates} />

      <div className="flex-1 space-y-3">
        {visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
            <p className="text-sm font-medium text-foreground">
              {reels.length === 0
                ? "Noch keine Pins – deine Karte ist so leer wie ein Café um 6 Uhr morgens."
                : "Nichts gefunden. Vielleicht suchst du zu genau."}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {reels.length === 0
                ? "Ziehe deinen Instagram-Export hierher oder füge oben einen Reel-Link ein."
                : "Passe die Suche oder die Filter an."}
            </p>
          </div>
        ) : (
          grouped.map((group) => (
            <Collapsible
              key={group.region}
              open={!collapsed.has(group.region)}
              onOpenChange={() => toggleRegion(group.region)}
            >
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-xl px-1 py-2 text-left transition-colors hover:bg-accent">
                <span className="text-sm font-semibold text-foreground">
                  {REGION_LABELS[group.region]}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {group.items.length}
                  <ChevronDown
                    className={cn(
                      "size-4 transition-transform",
                      collapsed.has(group.region) && "-rotate-90",
                    )}
                  />
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-1">
                {group.items.map((reel) => (
                  <ReelCard
                    key={reel.id}
                    reel={reel}
                    selected={selected?.id === reel.id}
                    onSelect={openReel}
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>
          ))
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button variant="ghost" size="sm" className="rounded-xl" onClick={exportBackup} disabled={reels.length === 0}>
          <Download className="size-4" />
          Backup
        </Button>
        <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => backupInputRef.current?.click()}>
          <Upload className="size-4" />
          Backup laden
        </Button>
        <input
          ref={backupInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => void importBackup(event.target.files)}
        />
        <span className="ml-auto text-xs text-muted-foreground">
          {reels.length} {reels.length === 1 ? "Pin" : "Pins"} – auf allen Geräten synchron.
        </span>
      </div>
    </div>
  );

  const mapPanel = (
    <ClientOnly
      fallback={
        <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
          Karte wird aufgerollt …
        </div>
      }
    >
      <ReelMap reels={visible} selectedId={selected?.id ?? null} onSelect={openReel} />
    </ClientOnly>
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">Reel-Karte</h1>
          <p className="text-xs text-muted-foreground">Deine gespeicherten Reels, endlich mit Adresse.</p>
        </div>
        <div className="flex rounded-full border border-border bg-background p-1 md:hidden">
          {(
            [
              { key: "map", label: "Karte", icon: MapIcon },
              { key: "list", label: "Liste", icon: List },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              aria-pressed={mobileView === key}
              onClick={() => setMobileView(key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                mobileView === key ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="grid min-h-0 flex-1 md:grid-cols-[minmax(360px,420px)_1fr]">
        <aside
          className={cn(
            "min-h-[calc(100vh-61px)] md:max-h-[calc(100vh-61px)] md:min-h-0 md:block md:border-r md:border-border",
            mobileView === "list" ? "block" : "hidden",
          )}
        >
          {listPanel}
        </aside>
        <div
          className={cn(
            "min-h-[calc(100vh-61px)] md:max-h-[calc(100vh-61px)] md:min-h-0 md:block",
            mobileView === "map" ? "block" : "hidden",
          )}
        >
          {mapPanel}
        </div>
      </main>


      <ReelDrawer
        reel={selected}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onUpdate={updateReel}
        onDelete={removeReel}
      />

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Reel hinzufügen</SheetTitle>
            <SheetDescription>Link rein, Ort dazu – fertig ist der Pin.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-8">
            <ReelForm
              key={addDraft.url}
              initial={addDraft}
              submitLabel="Pin setzen"
              onCancel={() => setAddOpen(false)}
              onSubmit={(reel) => {
                const added = addReels([reel]);
                setAddOpen(false);
                toast.success(
                  added > 0 ? "Pin gesetzt. Das Reel weiss jetzt, wo es hingehört." : "Diesen Link gibt es schon.",
                );
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{candidates.length} Reels gefunden</DialogTitle>
            <DialogDescription>
              Hake ab, was auf die Karte darf. Orte kannst du danach in Ruhe ergänzen.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2">
            {candidates.map((candidate) => (
              <li
                key={candidate.url}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-3"
              >
                <Checkbox
                  checked={checked.has(candidate.url)}
                  onCheckedChange={(value) =>
                    setChecked((current) => {
                      const next = new Set(current);
                      if (value) next.add(candidate.url);
                      else next.delete(candidate.url);
                      return next;
                    })
                  }
                  className="mt-0.5"
                  aria-label={`${candidate.title} auswählen`}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{candidate.title}</p>
                  {candidate.caption && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{candidate.caption}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="rounded-xl" onClick={() => setImportOpen(false)}>
              <X className="size-4" />
              Abbrechen
            </Button>
            <Button className="rounded-xl" onClick={confirmImport} disabled={checked.size === 0}>
              {checked.size} übernehmen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
