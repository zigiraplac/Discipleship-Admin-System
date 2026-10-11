"use client";

import { useMemo, useState } from "react";
import { Input, NativeSelect } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { PeopleTable } from "@/components/settings/people-table";
import type { LevelRole } from "@/components/settings/level-roles";
import type { AppUser } from "@/lib/domain/types";

const ALL = "all";
const NOWHERE = "none";

/** Every account in the world, filtered by continent, country and name. */
export function AccountsConsole({
  people,
  placesByUser,
  ...table
}: {
  people: AppUser[];
  placesByUser: Record<string, { continent: string; country: string }[]>;
  scopesByUser: Map<string, { cohortId: string; cohortName: string; capacity: string }[]>;
  cohorts: { id: string; name: string }[];
  currentUserId: string;
  levelRolesByUser: Record<string, LevelRole[]>;
  headerAction?: React.ReactNode;
}) {
  const [continent, setContinent] = useState(ALL);
  const [country, setCountry] = useState(ALL);
  const [query, setQuery] = useState("");

  const places = Object.values(placesByUser).flat();
  const continents = [...new Set(places.map((p) => p.continent))].filter((c) => c !== "—").sort();
  const countries = [...new Set(places.filter((p) => continent === ALL || p.continent === continent).map((p) => p.country))].filter((c) => c !== "—").sort();
  const unplaced = people.filter((p) => !(placesByUser[p.id] ?? []).length).length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => {
      const at = placesByUser[p.id] ?? [];
      if (continent === NOWHERE) {
        if (at.length) return false;
      } else if (continent !== ALL && !at.some((x) => x.continent === continent)) return false;
      if (country !== ALL && !at.some((x) => x.country === country)) return false;
      return !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q);
    });
  }, [people, placesByUser, continent, country, query]);

  return (
    <PeopleTable
      {...table}
      people={shown}
      placesByUser={placesByUser}
      toolbar={
        <div className="flex flex-wrap items-center gap-3 border-b border-divider px-[18px] py-4">
          <Segmented
            options={[
              { value: ALL, label: `All ${people.length}` },
              ...continents.map((c) => ({ value: c, label: c })),
              ...(unplaced ? [{ value: NOWHERE, label: `Not placed ${unplaced}` }] : []),
            ]}
            value={continent}
            onChange={(v) => {
              setContinent(v);
              setCountry(ALL);
            }}
            className="max-w-full flex-wrap"
          />
          {continent !== NOWHERE && countries.length > 0 && (
            <NativeSelect aria-label="Country" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value={ALL}>All countries</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
          )}
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a name or email" className="ml-auto" style={{ width: 210 }} />
        </div>
      }
    />
  );
}
