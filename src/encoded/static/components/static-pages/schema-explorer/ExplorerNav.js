import React, { useEffect, useState } from 'react';
import { concepts, branchOf } from './research-map';
import { routeHash } from './explorer-route';

// The explorer's one navigation. It renders inside the portal's SlidingSidebarLayout with the benchmarking data
// pages' side menu markup (section titles, .sidenav-link rows, .title-toggle-container groups), so both menus look
// and collapse alike. It holds one grouping only: the donor-to-data path. Schema groups and single schemas are
// reached from the catalog, so the menu never shows two overlapping ways of dividing the model.
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
    const steps = concepts.filter((concept) => concept.step);
    const branches = (id) => concepts.filter((concept) => branchOf[concept.id] === id);
    const conceptOpen = (id) => route.view === 'concept' && route.concept === id;
    const conceptRoute = (id) => { return { view: 'concept', concept: id }; };
    // The step holding the current concept opens on its own; others open on demand.
    const current = route.view === 'concept' ? branchOf[route.concept] || route.concept : '';
    const [open, setOpen] = useState(() => new Set(current ? [current] : []));
    useEffect(() => { if (current) setOpen((o) => (o.has(current) ? o : new Set([...o, current]))); }, [current]);
    const toggle = (id) => setOpen((o) => {
        const next = new Set(o);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    return (
        <nav className="sidebar-nav-body" aria-label="Schema Explorer">
            <div className="benchmarking-nav-section">
                <div className="benchmarking-nav-section-title text-small text-600">Metadata map</div>
                <div className="accordion">
                    <ul>
                        <NavLink top route={{ view: 'overview' }} active={route.view === 'overview'} onNavigate={onNavigate} title="Overview" />
                        {steps.map((step) => {
                            const under = branches(step.id);
                            if (!under.length) return <NavLink top key={step.id} route={conceptRoute(step.id)} active={conceptOpen(step.id)} onNavigate={onNavigate} title={step.label} />;
                            return (
                                <NavGroup key={step.id} route={conceptRoute(step.id)} active={conceptOpen(step.id)} open={open.has(step.id)}
                                    onToggle={() => toggle(step.id)} onNavigate={onNavigate} title={step.label}>
                                    {under.map((branch) => <NavLink key={branch.id} route={conceptRoute(branch.id)} active={conceptOpen(branch.id)} onNavigate={onNavigate} title={branch.label} />)}
                                </NavGroup>
                            );
                        })}
                    </ul>
                </div>
            </div>
            <hr />
            <div className="benchmarking-nav-section">
                <div className="benchmarking-nav-section-title text-small text-600">Schema reference</div>
                <div className="accordion">
                    <ul>
                        {/* The catalog leads to every group map and schema, so it stays marked on those pages too. */}
                        <NavLink top route={{ view: 'schemas' }} active={['schemas', 'schema', 'group'].includes(route.view)}
                            current={route.view === 'schemas'} onNavigate={onNavigate} title="All schemas" />
                    </ul>
                </div>
            </div>
        </nav>
    );
}
