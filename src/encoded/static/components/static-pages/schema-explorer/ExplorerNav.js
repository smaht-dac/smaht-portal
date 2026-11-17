import React, { useEffect, useState } from 'react';
import { concepts, branchOf } from './research-map';
import { routeHash } from './explorer-route';
import { domains, domainFor } from './domains';

// The explorer's one navigation. It renders inside the portal's SlidingSidebarLayout with the benchmarking data
// pages' side menu markup (section titles, .sidenav-link rows, .title-toggle-container groups), so both menus look
// and collapse alike. The schema reference lists the catalog and, under it, every schema group's map; the metadata
// map lists the donor-to-data path.
// Links carry their URL so they can also be opened in a new tab.
const follow = (event, onNavigate, route) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onNavigate(route);
};

function NavLink({ route, active, onNavigate, title, top = false, current = active }) {
    return (
        <li className={`sidenav-link${active ? ' active' : ''}${top ? ' top' : ''}`}>
            <a href={routeHash(route) || '#'} aria-current={current ? 'page' : undefined} onClick={(event) => follow(event, onNavigate, route)}>
                <span>{title}</span>
            </a>
        </li>
    );
}

// A page with pages under it: its title opens the page, the arrow shows or hides the pages under it.
function NavGroup({ route, active, open, onToggle, onNavigate, title, children }) {
    return (
        <li>
            <div className={`title-toggle-container${active ? ' active' : ''}`}>
                <a className="title" href={routeHash(route)} aria-current={active ? 'page' : undefined} onClick={(event) => follow(event, onNavigate, route)}>{title}</a>
                <button type="button" className="border-0 bg-transparent m-0 p-0" aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} pages under ${title}`} onClick={onToggle}>
                    <i className={`icon fas ${open ? 'icon-angle-up' : 'icon-angle-down'}`} aria-hidden="true" />
                </button>
            </div>
            {open && <div className="collapse show"><ul>{children}</ul></div>}
        </li>
    );
}

export default function ExplorerNav({ route, onNavigate }) {
    const groups = domains.filter((domain) => domain.types);
    const steps = concepts.filter((concept) => concept.step);
    const branches = (id) => concepts.filter((concept) => branchOf[concept.id] === id);
    const conceptOpen = (id) => route.view === 'concept' && route.concept === id;
    const conceptRoute = (id) => { return { view: 'concept', concept: id }; };
    // The step holding the current concept opens on its own, as does All schemas on a group map or schema; others
    // (and All schemas on its own page) open on demand.
    const current = route.view === 'concept' ? branchOf[route.concept] || route.concept : ['group', 'schema'].includes(route.view) ? 'schemas' : '';
    const [open, setOpen] = useState(() => new Set(current ? [current] : []));
    useEffect(() => { if (current) setOpen((o) => (o.has(current) ? o : new Set([...o, current]))); }, [current]);
    const toggle = (id) => setOpen((o) => {
        const next = new Set(o);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    return (
        <nav className="sidebar-nav-body" aria-label="Schema Explorer">
            {/* Every schema first: the catalog is where most readers start looking. */}
            <div className="benchmarking-nav-section">
                <div className="benchmarking-nav-section-title text-small text-600">Schema reference</div>
                <div className="accordion">
                    <ul>
                        {/* Every group map sits under the catalog; a group is marked on its map and while one of its
                            schemas is open. */}
                        <NavGroup route={{ view: 'schemas' }} active={route.view === 'schemas'} open={open.has('schemas')}
                            onToggle={() => toggle('schemas')} onNavigate={onNavigate} title="All schemas">
                            {groups.map((group) => (
                                <NavLink key={group.id} route={{ view: 'group', group: group.id }}
                                    active={(route.view === 'group' && route.group === group.id) || (route.view === 'schema' && domainFor(route.schema) === group.id)}
                                    current={route.view === 'group' && route.group === group.id} onNavigate={onNavigate} title={group.label} />
                            ))}
                        </NavGroup>
                    </ul>
                </div>
            </div>
            <hr />
            <div className="benchmarking-nav-section">
                <div className="benchmarking-nav-section-title text-small text-600">Donor to data</div>
                <div className="accordion">
                    <ul>
                        {/* The overview is the way into the path, so the steps sit under it, open unless folded away. */}
                        <NavGroup route={{ view: 'overview' }} active={route.view === 'overview'} open={!open.has('overview-folded')}
                            onToggle={() => toggle('overview-folded')} onNavigate={onNavigate} title="Overview">
                            {steps.map((step) => {
                                const under = branches(step.id);
                                if (!under.length) return <NavLink key={step.id} route={conceptRoute(step.id)} active={conceptOpen(step.id)} onNavigate={onNavigate} title={step.label} />;
                                return (
                                    <NavGroup key={step.id} route={conceptRoute(step.id)} active={conceptOpen(step.id)} open={open.has(step.id)}
                                        onToggle={() => toggle(step.id)} onNavigate={onNavigate} title={step.label}>
                                        {under.map((branch) => <NavLink key={branch.id} route={conceptRoute(branch.id)} active={conceptOpen(branch.id)} onNavigate={onNavigate} title={branch.label} />)}
                                    </NavGroup>
                                );
                            })}
                        </NavGroup>
                    </ul>
                </div>
            </div>
        </nav>
    );
}
