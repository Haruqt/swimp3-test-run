import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { StaffMember } from "@/lib/types";
import { Footer } from "@/components/layout/Footer";
import { ContactWidget } from "@/components/layout/ContactWidget";

/** Groups consecutive staff members that share the same role into one
 *  visual row, mirroring how the original site separates each role
 *  tier (Project Leader / Project Staff / Specialists / etc.) with a
 *  divider. A group of exactly one person renders centered; a group
 *  of 2+ renders in a 3-column grid (matching the original's grid,
 *  which is left unfilled rather than centered when a group has
 *  fewer than 3 people). */
function groupByRole(staff: StaffMember[]) {
  const groups: StaffMember[][] = [];
  for (const person of staff) {
    const last = groups[groups.length - 1];
    if (last && last[0].role === person.role) {
      last.push(person);
    } else {
      groups.push([person]);
    }
  }
  return groups;
}

function StaffCard({ person }: { person: StaffMember }) {
  return (
    <div className="group flex flex-col items-center rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-ink/5 transition duration-300 hover:-translate-y-1 hover:shadow-lg">
      <div className="relative h-36 w-36 overflow-hidden rounded-full bg-mist ring-4 ring-sand transition group-hover:ring-river/20 sm:h-44 sm:w-44">
        {person.photo_url && (
          <Image
            src={person.photo_url}
            alt={person.name}
            fill
            sizes="176px"
            className="object-cover"
          />
        )}
      </div>
      <p className="mt-5 font-display text-base font-bold uppercase tracking-wide text-ink">
        {person.name}
      </p>
      <span className="mt-1.5 inline-block rounded-full bg-river/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-river">
        {person.role}
      </span>
    </div>
  );
}

export default async function AboutPage() {
  const supabase = createClient();
  const { data: staffData, error: staffError } = await supabase
    .from("staff")
    .select("*")
    .order("sort_order", { ascending: true });

  if (staffError) {
    // Surfaces in `npm run dev`'s terminal / server logs instead of
    // silently rendering an empty section.
    console.error("Failed to load staff:", staffError.message);
  }

  const staff = (staffData as StaffMember[] | null) ?? [];
  const groups = groupByRole(staff);

  return (
    <>
    <main className="flex-1">
      {/* Hero */}
      <section className="border-b border-ink/10 bg-gradient-to-br from-[#F5A623] to-[#FFD966] px-6 pb-20 pt-32">
        <h1 className="mx-auto max-w-6xl font-display text-5xl font-bold text-white">
          ABOUT US
        </h1>
      </section>

      {/* Partner logos */}
      <section className="flex flex-wrap items-center justify-center gap-12 border-b border-ink/10 bg-white py-14">
        <div className="relative h-32 w-32 sm:h-40 sm:w-40">
          <Image src="/images/about/isu-logo.png" alt="Isabela State University" fill className="object-contain" />
        </div>
        <div className="relative h-24 w-64 sm:h-28 sm:w-80">
          <Image src="/images/about/swim-logo.png" alt="SWIM R&D Center" fill className="object-contain" />
        </div>
      </section>

      {/* Title + Rationale */}
      <section className="border-b border-ink/10 bg-white px-6 py-14">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-center font-display text-4xl font-bold leading-tight text-ink">
            GIS-Based Decision Support Tool in Managing Urban Water Infrastructure
            with Stormwater Intervention for Smart Cities: A Case for Cauayan City
          </h1>

          <h2 className="mt-12 font-display text-3xl font-semibold text-ink">
            Rationale
          </h2>
          <p className="mt-4 leading-relaxed text-ink/80">
            Cauayan City in Isabela is one of the country&apos;s premier
            agro-industrial hubs and also one of the Philippines&apos; first
            smart cities (Smart Communications, 2019), recognized by the
            Department of Science and Technology (DOST) for its innovation in
            adopting science and technology development (Alvarez, M.S. et.al.,
            2020). Since urban areas, such as Cauayan City, are the hub of
            economic development and activity, there is a tendency for people
            and businesses to converge which results in higher water demand.
            At present, Cauayan has a total fifteen (15) water pumping
            stations and eight (8) elevated water tanks serving only 12,067
            households (29%) out of 30,207 households (71%). The combined
            distribution efficiency of these water infrastructures under the
            management and supervision of the Cauayan City Water District
            (CCWD) is only 87% which is accounted from the 9,229.63 m3 of
            metered water out of the distributed water of 10,518.13 m3 daily
            or with a combined distribution losses of 10% which is 1282.50m3
            losses per day, ( Alvarez M. S. et.al., 2020). The said study
            suggests the necessity to introduce new and innovative water
            management technologies and systems adapted to climate change to
            addressed the need of the city like; improve the performance of
            the existing water infrastructure systems, lack of management
            tool for more efficient delivery of water services, limited
            service coverage of the water district due to limited water
            resource and depletion and contamination of aquifers and other
            water sources since shallow aquifer are mainly utilized. Hence, a
            GIS-based decision support tool in managing urban water
            infrastructure with storm water invention is a proposed solution
            to address the need of the city. In order to maximize and
            properly utilize water infrastructure, the integration of
            decision support systems (DSS) and geographic information systems
            (GIS) is needed to provide the necessary spatial database for
            transforming a simple spatial query and visualization tool into a
            powerful analytical and spatially distributed modeling tool
            (Satti, S.R., et.al. 2004). Reitsma (1996) define a DSS for water
            resources applications as computer-based systems which integrate
            state information, dynamic or process information, and plan
            evaluation tools into a single software implementation. One of
            the tools that can be used as DSS is the MIKE Operation. It is a
            complete GIS-integrated modelling tool that enables users to make
            sound decisions and create future concepts for urban stormwater
            systems &mdash; concepts that are cost-effective as well as
            resilient to change{" "}
            <Link
              href="http://www.mikepoweredbydhi.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-river underline hover:text-river-light"
            >
              www.mikepoweredbydhi.com
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Objectives / Outputs / Beneficiaries */}
      <section className="px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-2">
          <div className="flex items-center justify-center rounded-2xl bg-mist p-6 sm:p-8">
            <div className="relative h-[280px] w-full sm:h-[380px]">
              <Image
                src="/images/about/locationmap_tablet_.png"
                alt="Facility location map"
                fill
                className="object-contain"
              />
            </div>
          </div>

          <div>
            <h2 className="font-display text-3xl font-semibold text-ink">Objectives</h2>
            <p className="mt-4 text-ink/80">
              The general objective of this study is to develop a management tool for
              urban water infrastructure to help decision makers, policy makers, and
              managers in Cauayan City, Isabela. The specific objectives are:
            </p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-ink/80">
              <li>
                To conduct assessment and perform risk analysis of urban water
                infrastructure systems in Cauayan City;
              </li>
              <li>
                To develop a decision support tool for effective management of water
                infrastructure; and
              </li>
              <li>
                To design, construct, and evaluate an urban storm water storage system
                equipped with monitoring sensors.
              </li>
            </ol>

            <h2 className="mt-8 font-display text-3xl font-semibold text-ink">Outputs</h2>
            <ul className="mt-3 space-y-1 text-ink/80">
              {["Publications", "Patent/IP", "Products", "People Services", "Places and Partnerships", "Policy"].map(
                (o) => (
                  <li key={o}>{o}</li>
                )
              )}
            </ul>

            <h2 className="mt-8 font-display text-3xl font-semibold text-ink">
              Beneficiaries
            </h2>
            <ul className="mt-3 space-y-1 text-ink/80">
              <li>LGU Cauayan City</li>
              <li>Students from SUCs/HEIs taking up Engineering Courses</li>
              <li>Laundry businesses</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Stormwater Infrastructure Systems */}
      <section className="border-t border-ink/10 bg-mist px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-3xl font-semibold text-ink">
            Stormwater Infrastructure Systems
          </h2>
          <p className="mt-4 leading-relaxed text-ink/80">
            The stormwater water intervention facility has a total catchment area of 3
            hectares with a storage capacity of 1,750 cubic meters. The system includes a
            first flushing treatment device, a subsurface storage tank, a groundwater
            recharge tank, UV treatment, suction pumps, an elevated roof-top treated tank,
            and a water quality monitoring system with valves and piping.
          </p>
          <p className="mt-4 leading-relaxed text-ink/80">
            Elevating the storage tank was considered but found infeasible given the
            uneven building heights on-site (BJMP and PNP buildings are 4 storeys while
            others are one or two storeys), which would require motor pumps and heavy
            foundation structures. The subsurface design allows the space above the tank
            to be used for other purposes, such as the adjoining park.
          </p>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-ink/10 bg-white p-6">
              <p className="text-sm font-medium text-ink/60">
                Schematic diagram of subsurface storm-water storage system
              </p>
              <div className="relative mt-4 h-72 w-full sm:h-96">
                <Image
                  src="/images/about/Schematic diagram of subsurface.png"
                  alt="Schematic diagram of subsurface storm-water storage system"
                  fill
                  className="object-contain"
                />
              </div>
            </div>
            <div className="rounded-xl border border-ink/10 bg-white p-6">
              <p className="text-sm font-medium text-ink/60">
                Schematic Diagram of Stormwater site layout
              </p>
              <div className="relative mt-4 h-72 w-full sm:h-96">
                <Image
                  src="/images/about/Schematic Diagram of Stormwater.png"
                  alt="Schematic Diagram of Stormwater site layout"
                  fill
                  className="object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Staff — grouped by role, each group separated by a divider.
          Cards are centered and wrap naturally so groups of any size
          (1, 2, or 3 people) look intentional rather than left-packed. */}
      <section className="border-t border-ink/10 bg-mist px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.25em] text-river">
            Meet the Team
          </p>
          <h2 className="mt-2 text-center font-display text-3xl font-semibold text-ink sm:text-4xl">
            Project 3 Staffs
          </h2>

          {groups.length === 0 && (
            <p className="mt-6 text-center text-sm text-ink/50">
              No staff records found — run <code className="rounded bg-ink/5 px-1.5 py-0.5">npm run seed</code> to populate the staff table.
            </p>
          )}

          <div className="mt-14 divide-y divide-ink/10">
            {groups.map((group, i) => (
              <div key={i} className="py-12 first:pt-0 last:pb-0">
                <div className="flex flex-wrap justify-center gap-x-8 gap-y-10">
                  {group.map((person) => (
                    <div key={person.id} className="w-full max-w-[220px] sm:w-56">
                      <StaffCard person={person} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
    <Footer />
    <ContactWidget />
    </>
  );
}