import React, {
    useState,
    useMemo,
    useRef,
    useEffect,
    useCallback,
} from 'react';
import { layout, width, height } from './layout';
import { domains, domainFor, hierarchicalLayout, overviewLayout, abstractTypes } from './domains';
import { routeEdges } from './routing';
import { groupRelationships, sharedRelationships } from './relationship-view';
import { nodePresentation, stageAccent } from './node-presentation';
import ResearchOverview from './ResearchOverview';
import { explorerIndex } from './explorer-scope';
import { externalContextGroups } from './external-context';
import CrossGroupConnections, { outsideConnections } from './CrossGroupConnections';
import { Badge, Filters, visibleEdge, edgeLabel, exportPNG, ConceptTabs } from './shared';

const defaults = [];
const colors = { linkTo: '#2368aa', calculated: '#7952a3', reverse: '#986019' };
export default function Diagram({
    index: sourceIndex,
    focus = '',
    compact = false,
    onExplore,
    onDetail,
    onPlanner,
}) {
    const index = useMemo(() => explorerIndex(sourceIndex), [sourceIndex]);
    const [selected, setSelected] = useState(focus);
    const [outsideOpen, setOutsideOpen] = useState(false);
    const [expandedExternal, setExpandedExternal] = useState([]);
    const [domain, setDomain] = useState('');
    const [conceptContext, setConceptContext] = useState(null);
    // Where the back button returns after a concept focus; it survives clearing the focus.
    const [conceptReturn, setConceptReturn] = useState(null);
    const [showExternal, setShowExternal] = useState(false);
    useEffect(() => { setShowExternal(!!conceptContext); }, [conceptContext?.id]);
    useEffect(() => { setExpandedExternal([]); }, [conceptContext?.id, domain]);
    const [returnConcept, setReturnConcept] = useState('');
    const [focusReturnedMap, setFocusReturnedMap] = useState(false);
    const [arrangement, setArrangement] = useState('hierarchical');
    const [overviewMode, setOverviewMode] = useState('relationships');
    const [crossLinks, setCrossLinks] = useState(true);
    const [connectionMode, setConnectionMode] = useState('shared');
    const [hidden, setHidden] = useState(compact ? [] : defaults);
    const [kinds, setKinds] = useState(compact ? ['linkTo', 'calculated', 'reverse'] : ['linkTo']);
    // The arrow under the pointer or keyboard focus; its covered schemas are outlined.
    const [hoverEdge, setHoverEdge] = useState(null);
    const [neighbors, setNeighbors] = useState(false),
        [full, setFull] = useState(false);
    const [query, setQuery] = useState(''),
        [typeQuery, setTypeQuery] = useState('');
    const [moves, setMoves] = useState({}),
        [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
    const [size, setSize] = useState({ width: 1000, height: 600 });
    const [windowHeight, setWindowHeight] = useState(900);
    useEffect(() => {
        const update = () => setWindowHeight(window.innerHeight);
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);
    const [exporting, setExporting] = useState(false),
        [error, setError] = useState('');
    const diagramEntry = useRef();
    const markerPrefix = compact ? 'graph-arrow' : 'entity-arrow';
    useEffect(() => {
        if (!conceptContext) return undefined;
        const frame = requestAnimationFrame(() => {
            diagramEntry.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
            diagramEntry.current?.focus({ preventScroll: true });
        });
        return () => cancelAnimationFrame(frame);
    }, [conceptContext?.id]);
    const svg = useRef(),
        drag = useRef(),
        relationshipMenu = useRef(),
        typePicker = useRef(),
        mapSettings = useRef(),
        outsidePanel = useRef(),
        outsideCue = useRef();
    useEffect(() => {
        const closeMenus = (event) => {
            [typePicker.current, mapSettings.current, relationshipMenu.current].forEach((menu) => {
                if (menu?.open && !menu.contains(event.target)) menu.open = false;
            });
        };
        document.addEventListener('pointerdown', closeMenus);
        return () => document.removeEventListener('pointerdown', closeMenus);
    }, []);
    const nodes = useMemo(() => {
        const models = new Map(index.models.map((m) => [m.name, m]));
        for (const edge of index.edges)
            for (const name of [edge.from, edge.to])
                if (!models.has(name)) models.set(name, null);
        let names = [...models.keys()].sort();
        if (compact) {
            const related = new Set([
                focus,
                ...index.edges.filter((e) => e.from === focus).map((e) => e.to),
            ]);
            names = names.filter((n) => related.has(n));
        }
        return names.map((name) => {return { name, model: models.get(name) };});
    }, [index, compact, focus]);
    const edges = useMemo(
        () =>
            index.edges.filter(
                (e) => visibleEdge(e, kinds) && (!compact || e.from === focus)
            ),
        [index, kinds, compact, focus]
    );
    useEffect(() => { setOutsideOpen(false); }, [selected, domain, neighbors]);
    useEffect(() => {
        if (outsideOpen) outsidePanel.current?.querySelector('[data-close-connections]')?.focus({ preventScroll: true });
    }, [outsideOpen]);
    const externalGroups = useMemo(() => outsideConnections(selected, edges), [selected, edges]);
    const connected = useMemo(
        () =>
            new Set([
                selected,
                ...edges
                    .filter((e) => e.from === selected || e.to === selected)
                    .flatMap((e) => [e.from, e.to]),
            ]),
        [edges, selected]
    );
    const visibleConnected = neighbors ? connected : null;
    const neighborhoodSelection = neighbors ? selected : '';
    const conceptMembers = useMemo(() => new Set(conceptContext?.members || []), [conceptContext]);
    const contextReferences = useMemo(() => conceptContext?.connections?.flatMap((connection) => connection.edges) || [], [conceptContext]);
    // A concept focus anchors external links on its own schemas; without a focus the whole group is the anchor.
    const focusMembers = useMemo(() => conceptContext ? conceptMembers
        : new Set(nodes.filter((n) => domain && domainFor(n.name) === domain && !hidden.includes(n.name)).map((n) => n.name)),
    [conceptContext, conceptMembers, nodes, domain, hidden]);
    const externalReferences = useMemo(() => conceptContext ? contextReferences
        : index.edges.filter((edge) => edge.kind === 'linkTo' && focusMembers.has(edge.from) !== focusMembers.has(edge.to)),
    [conceptContext, contextReferences, index, focusMembers]);
    const allExternalNames = useMemo(() => new Set(showExternal && domain && !neighbors
        ? externalReferences.flatMap((edge) => [edge.from, edge.to]).filter((name) => domainFor(name) !== domain && !hidden.includes(name)) : []),
    [showExternal, domain, externalReferences, hidden, neighbors]);
    const externalBundles = useMemo(() => arrangement === 'hierarchical' ? externalContextGroups(allExternalNames) : [], [allExternalNames, arrangement]);
    const externalContextNames = useMemo(() => externalBundles.length
        ? new Set(externalBundles.filter((group) => expandedExternal.includes(group.id)).flatMap((group) => group.members)) : allExternalNames,
    [externalBundles, expandedExternal, allExternalNames]);
    const visible = useMemo(() => nodes.filter(
        (n) => !hidden.includes(n.name) && (visibleConnected ? visibleConnected.has(n.name) : (!domain || domainFor(n.name) === domain || externalContextNames.has(n.name)))
    ), [nodes, hidden, visibleConnected, domain, externalContextNames]);
    const names = useMemo(() => new Set(visible.map((n) => n.name)), [visible]);
    const groups = useMemo(() => groupRelationships(edges), [edges]);
    const edgeLanes = useMemo(() => {
        const pairs = new Map();
        groups.forEach((group) => {
            const pair = [group.from, group.to].sort().join('\0');
            if (!pairs.has(pair)) pairs.set(pair, []);
            pairs.get(pair).push(group);
        });
        const lanes = new Map();
        pairs.forEach((pairGroups) => {
            pairGroups.sort((a, b) => a.key.localeCompare(b.key));
            pairGroups.forEach((group, i) => {
                const direction = group.from.localeCompare(group.to) <= 0 ? 1 : -1;
                lanes.set(group.key, direction * (i - (pairGroups.length - 1) / 2) * 28);
            });
        });
        return lanes;
    }, [groups]);
    const showDomains = !compact && !neighbors && arrangement === 'hierarchical';
    const overview = showDomains && !domain;
    const researchOverview = overview && overviewMode === 'relationships';
    const cardWidth = overview ? 196 : width, cardHeight = overview ? 28 : height;
    // Group maps and the item page's relationship map shrink the canvas to their content, so layout and
    // fitting use the full canvas budget (65vh, min 400px as in the stylesheet) rather than the measured height.
    const groupMap = showDomains && !overview;
    const fitToContent = groupMap || compact;
    const budgetHeight = Math.max(400, windowHeight * 0.65);
    const layoutSize = useMemo(() => fitToContent ? { width: size.width, height: budgetHeight } : size,
        [fitToContent, size.width, fitToContent ? budgetHeight : size.height]);
    const allPositions = useMemo(() => showDomains ? {} : layout(visible, groups, layoutSize), [showDomains, visible, groups, layoutSize]);
    const clustered = useMemo(() => {
        if (!showDomains) return { positions: {}, frames: [], layers: [] };
        if (overview) return overviewLayout(visible, size);
        const result = hierarchicalLayout(visible.filter((node) => !externalContextNames.has(node.name)), width, height, index.edges, layoutSize);
        if (externalContextNames.size || externalBundles.length) {
            const right = Math.max(...result.frames.map((frame) => frame.left + frame.width));
            let row = 0;
            if (externalBundles.length) externalBundles.forEach((group) => {
                result.positions[group.name] = { x: right + 60 + width / 2, y: 110 + row++ * (height + 40) };
                if (expandedExternal.includes(group.id)) group.members.forEach((name) => {
                    result.positions[name] = { x: right + 60 + width / 2, y: 110 + row++ * (height + 40) };
                });
            });
            else [...externalContextNames].sort().forEach((name, i) => {
                result.positions[name] = { x: right + 60 + width / 2, y: 110 + i * (height + 60) };
            });
        }
        return result;
    }, [showDomains, overview, visible, index, size, layoutSize, externalContextNames, externalBundles, expandedExternal]);
    const positions = useMemo(() => {
        if (!neighbors || !neighborhoodSelection) return { ...(showDomains ? clustered.positions : allPositions), ...moves };
        const others = nodes.filter(
            (n) =>
                n.name !== neighborhoodSelection &&
                !hidden.includes(n.name) &&
                visibleConnected.has(n.name)
        );
        const columns = Math.max(
            1,
            Math.ceil(
                Math.sqrt(
                    (others.length * size.width) / Math.max(size.height, 1)
                )
            )
        );
        const result = { [neighborhoodSelection]: { x: 0, y: -160 } };
        others.forEach((n, i) => {
            result[n.name] = {
                x: ((i % columns) - (columns - 1) / 2) * (width + 120),
                y: Math.floor(i / columns) * (height + 110),
            };
        });
        return { ...result, ...moves };
    }, [
        allPositions,
        moves,
        neighbors,
        neighborhoodSelection,
        hidden,
        visibleConnected,
        nodes,
        size,
        showDomains,
        clustered,
    ]);
    const visibleGroups = useMemo(() => groups.filter(
        (g) => names.has(g.from) && names.has(g.to) &&
            (!showDomains || (showExternal && (externalContextNames.has(g.from) || externalContextNames.has(g.to))) || domainFor(g.from) === domainFor(g.to) || (crossLinks && (g.from === selected || g.to === selected)))
    ), [groups, names, showDomains, selected, crossLinks, showExternal, externalContextNames]);
    const scopedGroups = useMemo(() => visibleGroups.filter(
        (g) => (!showDomains || !selected || g.from === selected || g.to === selected)
    ), [visibleGroups, showDomains, selected]);
    const shared = useMemo(() => showDomains && !overview ? sharedRelationships(index, visibleGroups, names)
        : { groups: visibleGroups, inherited: {} }, [showDomains, overview, index, visibleGroups, names]);
    const summarize = showDomains && !overview && !selected && connectionMode === 'shared';
    const shownGroups = useMemo(() => {
        const result = summarize ? shared.groups.filter((group) => group.from !== group.to) : scopedGroups;
        const bundled = externalBundles.filter((bundle) => !expandedExternal.includes(bundle.id)).flatMap((bundle) => {
            const matches = edges.filter((edge) => (focusMembers.has(edge.from) && bundle.members.includes(edge.to)) ||
                (focusMembers.has(edge.to) && bundle.members.includes(edge.from)));
            // With shared definitions, an inherited reference is drawn once from the visible base that defines it,
            // exactly as inside the group; otherwise each anchoring schema keeps its own arrow.
            const owners = new Map();
            if (summarize) {
                sharedRelationships(index, groupRelationships(matches.filter((edge) => focusMembers.has(edge.from))), names).groups
                    .forEach((group) => { if (focusMembers.has(group.from)) group.edges.forEach((edge) => owners.set(edge, group.from)); });
            }
            const anchor = (edge, outgoing) => outgoing ? owners.get(edge) || edge.from : edge.to;
            return [...focusMembers].flatMap((member) => [true, false].map((outgoing) => {
                const references = matches.filter((edge) => focusMembers.has(outgoing ? edge.from : edge.to) && anchor(edge, outgoing) === member);
                return references.length ? { ...references[0], from: outgoing ? member : bundle.name,
                    to: outgoing ? bundle.name : member, key: `${bundle.name}:${member}:${outgoing}`, edges: references, bundled: true,
                    shared: references.some((edge) => outgoing && edge.from !== member) } : null;
            })).filter(Boolean);
        });
        return [...result, ...bundled];
    }, [summarize, shared, scopedGroups, externalBundles, expandedExternal, edges, focusMembers, index, names]);
    // A single group is named in the toolbar, so its title stays readable at every zoom level.
    const singleFrame = showDomains && !overview && clustered.frames.length === 1 ? clustered.frames[0] : null;
    // Explains only the node styles currently drawn; external schemas appear individually or bundled by group depending on how many there are.
    const legend = showDomains && !overview ? [
        ['schema', 'Schema in this group'],
        visible.some((n) => abstractTypes.has(n.name)) && ['abstract', 'Abstract base type (shared fields)'],
        conceptContext && ['center', `In focus: ${conceptContext.label}`],
        externalContextNames.size > 0 && ['external', 'Schema from another group (labelled above the card)'],
        externalBundles.some((bundle) => !expandedExternal.includes(bundle.id)) && ['bundle', 'Another group, collapsed: Expand to list its schemas'],
        summarize && ['covered', 'Hover an arrow to trace it; an arrow from a base type also marks the subtypes that inherit it'],
        ['arrow', 'Arrow points to the referenced schema'],
    ].filter(Boolean) : [];
    const linkTotal = summarize ? shownGroups.length : shownGroups.reduce((n, g) => n + g.edges.length, 0);
    const title = compact ? 'Relationships' : neighbors ? selected
        : singleFrame?.label || domains.find((d) => d.id === domain)?.label || 'All schemas';
    const eyebrow = compact ? '' : neighbors ? 'Schema neighborhood' : domain ? 'Schema group' : '';
    const facts = [
        `${visible.length} ${visible.length === 1 ? 'schema' : 'schemas'}`,
        `${linkTotal} ${linkTotal === 1 ? 'link' : 'links'}${summarize ? ' (shared definitions)' : ''}`,
    ];
    const headings = useMemo(() => showDomains ? [
        ...clustered.frames.map((frame) => {return { left: frame.left + 18, top: frame.top + 12, width: Math.min(frame.width - 36, frame.label.length * 15 + 12), height: 38 };}),
        ...clustered.layers,
        ...[...externalContextNames].filter((name) => positions[name]).map((name) => {return { left: positions[name].x - width / 2, top: positions[name].y - height / 2 - 20, width, height: 18 };}),
    ] : [], [showDomains, clustered, externalContextNames, positions]);
    const routes = useMemo(() => showDomains && !overview
        ? routeEdges(positions, shownGroups, width, height, headings, { spreadPorts: true }) : {},
    [showDomains, overview, positions, shownGroups, headings]);
    const bounds = useMemo(() => {
        const points = visible.flatMap((n) => [
            { x: positions[n.name].x - cardWidth / 2, y: positions[n.name].y - cardHeight / 2 },
            { x: positions[n.name].x + cardWidth / 2, y: positions[n.name].y + cardHeight / 2 },
        ]);
        externalBundles.forEach((group) => {
            const p = positions[group.name];
            if (p) points.push({ x: p.x - width / 2, y: p.y - height / 2 }, { x: p.x + width / 2, y: p.y + height / 2 });
        });
        if (showDomains) {
            // A single group's title lives in the toolbar, so its reserved heading band is not content.
            const contentTop = (f) => singleFrame ? Math.min(...clustered.layers.map((layer) => layer.panel?.top ?? layer.top)) : f.top;
            clustered.frames.forEach((f) => points.push({ x: f.left, y: contentTop(f) }, { x: f.left + f.width, y: f.top + f.height }));
            Object.values(routes).forEach((route) => points.push(...route.points));
        }
        return points.length ? {
            left: Math.min(...points.map((p) => p.x)) - (showDomains ? 20 : 65),
            right: Math.max(...points.map((p) => p.x)) + (showDomains ? 20 : 65),
            top: Math.min(...points.map((p) => p.y)) - (showDomains ? 20 : 90),
            bottom: Math.max(...points.map((p) => p.y)) + (showDomains ? 20 : 65),
        } : { left: -300, right: 300, top: -200, bottom: 200 };
    }, [visible, positions, showDomains, clustered, routes, cardWidth, cardHeight, externalBundles, singleFrame]);
    const fitScale = useCallback((readable = true) => {
        const fitted = Math.min(
            showDomains ? 1.25 : 1.5,
            layoutSize.width / (bounds.right - bounds.left),
            layoutSize.height / (bounds.bottom - bounds.top)
        );
        return Math.max(showDomains && readable ? externalBundles.length ? 0.65 : 0.85 : 0.05, fitted);
    }, [bounds.left, bounds.right, bounds.top, bounds.bottom, layoutSize, showDomains, externalBundles.length]);
    const fit = useCallback((readable = true) => {
        const scale = fitScale(readable);
        const fitsX = (bounds.right - bounds.left) * scale <= layoutSize.width;
        const fitsY = (bounds.bottom - bounds.top) * scale <= layoutSize.height;
        setCamera({
            scale,
            x: fitsX ? (layoutSize.width - (bounds.left + bounds.right) * scale) / 2 : 16 - bounds.left * scale,
            // Group maps start at the top edge; centring a short map leaves a large empty band above it.
            y: fitsY && !fitToContent ? (layoutSize.height - (bounds.top + bounds.bottom) * scale) / 2 : 16 - bounds.top * scale,
        });
    }, [bounds.left, bounds.right, bounds.top, bounds.bottom, layoutSize, fitToContent, fitScale]);
    // The canvas ends just below the fitted map; zooming in later pans within this height.
    const canvasHeight = fitToContent && !full
        ? Math.min(budgetHeight, Math.max(280, Math.ceil((bounds.bottom - bounds.top) * fitScale() + 32))) : undefined;
    // Selecting a node only highlights it in the full map. Refit selection
    // changes only when they replace the displayed neighborhood.
    const layoutFocus = neighbors ? selected : focus;
    useEffect(() => {
        fit();
    }, [index, hidden, kinds, neighbors, layoutFocus, size, full, domain, arrangement, connectionMode, conceptContext, expandedExternal]);
    useEffect(() => {
        if (!svg.current) return undefined;
        const observer = new ResizeObserver((entries) => {
            const rect = entries[0].contentRect;
            if (rect.width && rect.height)
                setSize((previous) => previous.width === rect.width && previous.height === rect.height
                    ? previous : { width: rect.width, height: rect.height });
        });
        observer.observe(svg.current);
        return () => observer.disconnect();
    }, [researchOverview]);
    useEffect(() => {
        if (!full) return undefined;
        const escape = (e) => {
            if (e.key === 'Escape') setFull(false);
        };
        document.addEventListener('keydown', escape);
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', escape);
            document.body.style.overflow = previous;
        };
    }, [full]);
    const zoom = (factor, x = size.width / 2, y = size.height / 2) =>
        setCamera((c) => {
            const scale = Math.max(0.05, Math.min(3, c.scale * factor));
            return {
                scale,
                x: x - ((x - c.x) * scale) / c.scale,
                y: y - ((y - c.y) * scale) / c.scale,
            };
        });
    useEffect(() => {
        const element = svg.current;
        if (!element) return undefined;
        const wheel = (e) => {
            e.preventDefault();
            const rect = element.getBoundingClientRect();
            zoom(
                e.deltaY < 0 ? 1.1 : 1 / 1.1,
                e.clientX - rect.left,
                e.clientY - rect.top
            );
        };
        element.addEventListener('wheel', wheel, { passive: false });
        return () => element.removeEventListener('wheel', wheel);
    }, [researchOverview]);
    const choose = useCallback((name) => {
        if (!neighbors && !externalContextNames.has(name) && (domain || showDomains) && domainFor(name) !== domain) {
            setConceptContext(null);
            setConceptReturn(null);
            setDomain(domainFor(name));
            setMoves({});
        }
        if (hidden.includes(name)) setHidden(hidden.filter((n) => n !== name));
        setQuery('');
        setSelected(name);
        if (neighbors) setMoves({});
        if (compact) onExplore(name);
    }, [neighbors, domain, showDomains, hidden, compact, onExplore, externalContextNames]);
    const setVisibility = (next) => {
        setHidden(next);
        setMoves({});
        if (next.includes(selected)) {
            setSelected('');
            setNeighbors(false);
        }
    };
    const inspect = (group) =>
        onDetail({
            title: group.bundled ? `${conceptContext?.label || domains.find((d) => d.id === domain)?.label}: external relationships` : `${group.from} → ${group.to}`,
            value: group.edges,
            relationship: group.edges,
            intro: group.shared
                ? `Shared definition drawn once at ${group.from}. The exact references from all represented schemas are listed below. [] denotes an array.`
                : '[] denotes an array. Arrows point to the referenced type.',
            sources: group.edges.flatMap(
                (e) =>
                    index.models
                        .find((m) => m.name === e.from)
                        ?.fields.find(
                            (f) =>
                                f.name ===
                                e.field.split('.')[0].replaceAll('[]', '')
                        )?.sources || []
            ),
        });
    const chooseDomain = useCallback((id) => {
        setConceptContext(null);
        setConceptReturn(null);
        setReturnConcept('');
        setDomain(id);
        setConnectionMode('shared');
        if (!id) setOverviewMode('relationships');
        setSelected('');
        setNeighbors(false);
        setMoves({});
    }, []);
    const exploreConcept = (concept) => {
        setConceptContext({ id: concept.id, label: concept.label, hint: concept.hint, color: concept.color, domain: concept.domain, members: concept.members, connections: concept.connections, origin: concept.origin || 'concept' });
        setConceptReturn({ id: concept.id, label: concept.label, origin: concept.origin || 'concept' });
        setFocusReturnedMap(false);
        setDomain(concept.domain);
        setSelected('');
        setNeighbors(false);
        setMoves({});
        setArrangement('hierarchical');
    };
    const clearFocus = () => {
        setConceptContext(null);
        setSelected('');
        setNeighbors(false);
        setMoves({});
    };
    // Leaves the concept: `summary` opens its Summary tab, otherwise the metadata map is shown.
    const backToConcept = (summary = false) => {
        setReturnConcept(summary ? conceptReturn.id : '');
        setFocusReturnedMap(!summary);
        setConceptContext(null);
        setConceptReturn(null);
        setDomain('');
        setOverviewMode('relationships');
        setSelected('');
        setNeighbors(false);
        setMoves({});
    };
    const clearSelection = () => {
        setSelected('');
        setNeighbors(false);
        setMoves({});
    };
    const closeOutside = () => {
        setOutsideOpen(false);
        outsideCue.current?.focus({ preventScroll: true });
    };
    const outsideWidth = Math.min(440, size.width - 24);
    const outsideHeight = Math.min(480, size.height - 24);
    const selectedPosition = positions[selected];
    const nodeRight = selectedPosition ? camera.x + (selectedPosition.x + cardWidth / 2) * camera.scale : 0;
    const nodeLeft = selectedPosition ? camera.x + (selectedPosition.x - cardWidth / 2) * camera.scale : 0;
    const outsideLeft = nodeRight + 12 + outsideWidth <= size.width
        ? nodeRight + 12 : Math.max(12, Math.min(size.width - outsideWidth - 12, nodeLeft - outsideWidth - 12));
    const outsideTop = selectedPosition
        ? Math.max(12, Math.min(size.height - outsideHeight - 12, camera.y + selectedPosition.y * camera.scale - 36)) : 12;
    const showConnected = () => {
        setHidden(hidden.filter((name) => !connected.has(name)));
        setMoves({});
        setNeighbors(true);
    };
    const incident = edges.filter(
        (e) =>
            (e.from === selected || e.to === selected) &&
            names.has(e.from) &&
            names.has(e.to)
    );
    // Schema descriptions that only restate the name ("Death Circumstances") add nothing under the title.
    const selectedDescription = useMemo(() => {
        if (!selected) return '';
        const { description } = nodePresentation(selected, index.models.find((m) => m.name === selected));
        return description.replace(/[\s_.-]/g, '').toLowerCase() === selected.toLowerCase() ? '' : description;
    }, [selected, index]);
    // The first tooltip line names the arrow as drawn (a shared base or a collapsed group can stand in
    // for the exact endpoints); the exact schema references follow.
    const edgeTooltip = (g) => {
        const end = (name) => externalBundles.find((bundle) => bundle.name === name)?.label || name;
        const heirs = new Set(g.edges.map((e) => e.from).filter((name) => name !== g.from)).size;
        const note = g.shared && heirs ? ` · defined on ${g.from}, inherited by ${heirs} ${heirs === 1 ? 'schema' : 'schemas'}` : '';
        const header = `${end(g.from)} → ${end(g.to)}${note}`;
        return `${header}\n\n${g.edges.map((e) => `${e.from}.${e.field} → ${e.to}`).join('\n')}`;
    };
    // Hovering any arrow traces it: both ends are marked and the rest of the map steps back. An arrow drawn
    // once from a base type also marks the subtypes that inherit it, so the shared definition stays visible.
    const coveredByHover = useMemo(() => {
        if (!hoverEdge?.shared) return new Set();
        return new Set(hoverEdge.edges.map((e) => e.from).filter((name) => name !== hoverEdge.from));
    }, [hoverEdge]);
    const tracedEnds = useMemo(() => new Set(hoverEdge ? [hoverEdge.from, hoverEdge.to] : []), [hoverEdge]);
    const drawnGroups = overview ? [] : shownGroups;
    const showAllTypes = useCallback(() => { setReturnConcept(''); setOverviewMode('types'); }, []);
    if (researchOverview) {
        return (
            <ResearchOverview index={index} nodes={visible} onType={choose}
                onAllTypes={showAllTypes} onDetail={onDetail} onConnections={exploreConcept} initialConcept={returnConcept} focusMap={focusReturnedMap} />
        );
    }
    return (
        <section ref={diagramEntry} tabIndex={-1}
            className={`se-diagram${compact ? ' se-compact' : ''}${conceptContext ? ' se-concept-diagram' : ''}${full ? ' se-fullscreen' : ''}${showDomains ? ' se-hierarchical' : ''}${overview ? ' se-overview' : ''}`}
            aria-label={
                compact ? 'Item relationships' : 'All schema relationships'
            }>
            <header className="se-diagram-header">
                {overview && <button type="button" className="se-diagram-back" onClick={() => setOverviewMode('relationships')}>← Metadata map</button>}
                {conceptReturn && <button type="button" className="se-diagram-back" onClick={() => backToConcept(false)}>← Metadata map</button>}
                {domain && !compact && !conceptReturn && <button type="button" className="se-diagram-back" onClick={() => chooseDomain('')}>← Metadata map</button>}
                <div className="se-diagram-heading" style={conceptContext?.color ? { '--se-concept-color': conceptContext.color } : undefined}>
                    {conceptContext ? (
                        <>
                            <span className="se-diagram-eyebrow">Explore the metadata</span>
                            <h2>{conceptContext.label}</h2>
                            {conceptContext.hint && <p className="se-diagram-question">{conceptContext.hint}</p>}
                            <ConceptTabs active="map" label={conceptContext.label} onSummary={() => backToConcept(true)} />
                        </>
                    ) : (
                        <>
                            {eyebrow && <span className="se-diagram-eyebrow">{eyebrow}</span>}
                            <h2>{title}</h2>
                        </>
                    )}
                    {overview && <p className="se-diagram-question">Every schema in the model, grouped by area. Select a group for its map or a schema for its details.</p>}
                    <ul className="se-diagram-facts" aria-label="Diagram summary">
                        {conceptContext && singleFrame && <li>Group: {singleFrame.label}</li>}
                        {facts.map((fact) => <li key={fact}>{fact}</li>)}
                        {conceptContext && (
                            <li className="se-diagram-focus-chip" title={`${conceptContext.label} schemas are outlined in the diagram and its links to other groups are shown. Remove to view the whole group evenly.`}>
                                <span className="se-focus-swatch" aria-hidden="true" />
                                Highlighting {conceptContext.label}
                                <button type="button" onClick={clearFocus} aria-label={`Stop highlighting ${conceptContext.label}`}>×</button>
                            </li>
                        )}
                    </ul>
                </div>
            </header>
            <div className="se-diagram-controls">
                {!compact && (
                    <input
                        type="search"
                        aria-label="Search schemas"
                        placeholder="Search schemas…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                )}
                <div className="se-map-tool-section" role="group" aria-label="Diagram filters">
                    <span className="se-control-label">Show</span>
                    {showDomains && !overview && (
                        <label>Connections
                            <select aria-label="Connection detail" value={selected ? 'selected' : connectionMode} onChange={(event) => setConnectionMode(event.target.value)} disabled={!!selected}>
                                {selected && <option value="selected">Selected type: exact links</option>}
                                <option value="shared">Shared definitions</option>
                                <option value="all">All references</option>
                            </select>
                        </label>
                    )}
                    {showDomains && !overview && domain && !neighbors && (
                        <label className="se-external-toggle"><input type="checkbox" checked={showExternal} onChange={(e) => { setShowExternal(e.target.checked); setMoves({}); }} />Links to other groups</label>
                    )}
                    <details ref={relationshipMenu}>
                        <summary>Relationships {kinds.length}/3</summary>
                        <div className="se-link-filter-popover"><Filters kinds={kinds} onChange={setKinds} /></div>
                    </details>
                    {!compact && (
                        <details className="se-type-picker" ref={typePicker}>
                            <summary>Types {nodes.filter((n) => !hidden.includes(n.name)).length}/{nodes.length}</summary>
                            <div className="se-type-popover">
                                <input aria-label="Filter types" placeholder="Filter types…" value={typeQuery} onChange={(e) => setTypeQuery(e.target.value)} />
                                <div className="se-toolbar">
                                    <button type="button" onClick={() => setVisibility([])}>Show all</button>
                                    <button type="button" onClick={() => setVisibility(nodes.map((n) => n.name))}>Hide all</button>
                                    <button type="button" onClick={() => setVisibility(defaults)}>Defaults</button>
                                </div>
                                <div>
                                    {nodes.filter((n) => n.name.toLowerCase().includes(typeQuery.toLowerCase())).map((n) => (
                                        <label key={n.name}>
                                            <input type="checkbox" checked={!hidden.includes(n.name)} onChange={(e) => setVisibility(e.target.checked ? hidden.filter((v) => v !== n.name) : [...hidden, n.name])} />
                                            {n.name}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </details>
                    )}
                    {!compact && (
                        <details className="se-map-settings" ref={mapSettings}>
                            <summary>Map settings</summary>
                            <div className="se-map-settings-popover">
                                <label>Group
                                    <select aria-label="Schema group" value={domain} onChange={(e) => chooseDomain(e.target.value)}>
                                        <option value="">All groups</option>
                                        {domains.filter((d) => nodes.some((n) => domainFor(n.name) === d.id)).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                                    </select>
                                </label>
                                <label>Layout
                                    <select aria-label="Diagram layout" value={arrangement} onChange={(e) => { setArrangement(e.target.value); setMoves({}); }}>
                                        <option value="hierarchical">Hierarchical</option>
                                        <option value="network">Network</option>
                                    </select>
                                </label>
                                {showDomains && <label className="se-map-cross-links"><input type="checkbox" checked={crossLinks} onChange={(e) => setCrossLinks(e.target.checked)} />Include cross-group links for the selected schema</label>}
                            </div>
                        </details>
                    )}
                </div>
                <div className="se-map-tool-section se-canvas-actions" role="group" aria-label="Canvas controls">
                    <div className="se-zoom-controls" role="group" aria-label="Zoom controls">
                        <button type="button" onClick={() => fit(false)}>Fit all</button>
                        <button type="button" aria-label="Zoom out" onClick={() => zoom(0.8)}>−</button>
                        <span>{Math.round(camera.scale * 100)}%</span>
                        <button type="button" aria-label="Zoom in" onClick={() => zoom(1.25)}>+</button>
                    </div>
                    <button type="button" onClick={() => { setMoves({}); fit(); }}>Reset layout</button>
                    <button type="button" id={compact ? 'graph-export' : 'entity-export'} disabled={exporting} onClick={async () => {
                        setExporting(true);
                        try { await exportPNG(svg.current, compact ? `${focus}-relationships` : 'schema-map'); }
                        catch (err) { setError(err.message || 'PNG export failed.'); }
                        finally { setExporting(false); }
                    }}>{exporting ? 'Exporting…' : 'Export PNG'}
                    </button>
                </div>
            </div>
            {query && (
                <div className="se-toolbar">
                    {nodes
                        .filter(
                            (n) =>
                                n.name
                                    .toLowerCase()
                                    .includes(query.toLowerCase())
                        )
                        .slice(0, 12)
                        .map((n) => (
                            <button type="button" key={n.name} onClick={() => choose(n.name)}>
                                {n.name}
                            </button>
                        ))}
                </div>
            )}
            {error && <p role="alert">{error}</p>}
            {!compact && selected && (
                <div className="se-selection-bar" role="status" aria-label="Selected schema">
                    <span className="se-selection-label">Selected</span>
                    <strong>{selected}</strong>
                    <span className="se-selection-meta">{incident.length} {incident.length === 1 ? 'link' : 'links'} highlighted · details below the map</span>
                    <span className="se-selection-actions">
                        <button type="button" id="entity-show-neighborhood" aria-pressed={neighbors} onClick={() => {
                            if (!neighbors) showConnected();
                            else { setMoves({}); setNeighbors(false); }
                        }}>{neighbors ? 'Back to the whole group' : 'Show only its connections'}
                        </button>
                        <button type="button" onClick={() => onExplore(selected)}>Open schema details →</button>
                        <button type="button" className="se-selection-clear" onClick={clearSelection} aria-label={`Clear selection of ${selected}`}>Clear ×</button>
                    </span>
                </div>
            )}
            {!selected && conceptContext && <p className="se-flow-note">Highlighted schemas belong to {conceptContext.label}. Select a schema or arrow to explore its relationships. Drag to pan; scroll to zoom.</p>}
            {!selected && !showDomains && !conceptContext && <p className="se-flow-note">Drag the background to pan, scroll to zoom, or drag a type to move it. Select a type to highlight its neighbors; select an edge to inspect its fields.</p>}
            {!selected && showDomains && !conceptContext && (
                <p className="se-flow-note">{overview ? 'Groups follow the biological workflow, from donors to files.' : selected
                    ? `Showing ${selected} references between visible schemas, including inherited and self-references. Clear selection to return to the group overview.`
                    : summarize ? 'Inherited references are drawn once at their visible base type. Select a type for its exact links, including self-references, or choose All references.'
                        : 'All references are expanded. Select a type to focus its connections, or choose Shared definitions to combine inherited links.'}
                </p>
            )}
            {legend.length > 0 && (
                <ul className="se-diagram-legend" aria-label="Diagram legend">
                    {legend.map(([kind, label]) => <li key={kind}><span className={`se-legend-swatch se-legend-${kind}`} aria-hidden="true" />{label}</li>)}
                </ul>
            )}
            <div className="se-canvas-wrap">
                {!compact && (
                    <button type="button" className="se-canvas-fullscreen" id="entity-fullscreen" aria-label={full ? 'Exit full screen' : 'Enter full screen'} title={full ? 'Exit full screen' : 'Enter full screen'} aria-pressed={full} onPointerDown={(e) => e.stopPropagation()} onClick={() => setFull(!full)}>
                        <svg aria-hidden="true" viewBox="0 0 16 16"><path d={full ? 'M6 1v5H1M10 1v5h5M15 10h-5v5M6 15v-5H1' : 'M1 6V1h5M10 1h5v5M15 10v5h-5M6 15H1v-5'} /></svg>
                    </button>
                )}
                <svg
                    ref={svg}
                    id={compact ? 'graph' : 'entity-svg'}
                    className="se-canvas"
                    style={canvasHeight ? { height: canvasHeight, minHeight: 0 } : undefined}
                    tabIndex={0}
                    role="group"
                    aria-label="Schema relationship diagram"
                    onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        // Capturing on the SVG retargets clicks away from edges.
                        // Leave relationship controls to their own click handlers.
                        if (e.target.closest('.se-edge, .se-edge-label, [data-external-group]')) return;
                        const name =
                        e.target.closest('[data-entity]')?.dataset.entity;
                        drag.current = {
                            id: e.pointerId,
                            name,
                            x: e.clientX,
                            y: e.clientY,
                            moved: false,
                        };
                        e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                    onPointerMove={(e) => {
                        const d = drag.current;
                        if (!d || d.id !== e.pointerId) return;
                        const dx = e.clientX - d.x,
                            dy = e.clientY - d.y;
                        if (!dx && !dy) return;
                        d.moved = true;
                        d.x = e.clientX;
                        d.y = e.clientY;
                        if (overview && d.name) return;
                        if (d.name)
                            setMoves((m) => {return {
                                ...m,
                                [d.name]: {
                                    x:
                                    (m[d.name] || positions[d.name]).x +
                                    dx / camera.scale,
                                    y:
                                    (m[d.name] || positions[d.name]).y +
                                    dy / camera.scale,
                                },
                            };});
                        else setCamera((c) => {return { ...c, x: c.x + dx, y: c.y + dy };});
                    }}
                    onPointerUp={(e) => {
                        const d = drag.current;
                        drag.current = null;
                        if (d && !d.moved && d.name) choose(d.name);
                        if (e.currentTarget.hasPointerCapture(e.pointerId))
                            e.currentTarget.releasePointerCapture(e.pointerId);
                    }}
                    onPointerCancel={() => {
                        drag.current = null;
                    }}
                    onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        const delta = {
                            ArrowLeft: [50, 0],
                            ArrowRight: [-50, 0],
                            ArrowUp: [0, 50],
                            ArrowDown: [0, -50],
                        }[e.key];
                        if (delta) {
                            e.preventDefault();
                            setCamera((c) => {return {
                                ...c,
                                x: c.x + delta[0],
                                y: c.y + delta[1],
                            };});
                        }
                    }}>
                    {/* Arrowheads are markers on their path, so they share its colour, opacity and direction. */}
                    <defs>
                        {Object.entries(colors).map(([kind, color]) => (
                            <marker key={kind} id={`${markerPrefix}-${kind}`} viewBox="0 0 10 8" refX="10" refY="4"
                                markerWidth="10" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">
                                <path d="M0,0 L10,4 L0,8 Z" fill={color} />
                            </marker>
                        ))}
                    </defs>
                    <g
                        data-world=""
                        className={hoverEdge ? 'se-tracing-inheritance' : undefined}
                        transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
                        {showDomains && clustered.frames.map((frame) => (
                            <g key={frame.id} className="se-domain-frame">
                                <rect x={frame.left} y={frame.top} width={frame.width} height={frame.height} rx="12" />
                                {!singleFrame && (
                                    <text x={frame.left + 24} y={frame.top + 38} role="button" tabIndex={0}
                                        aria-label={`Focus group: ${frame.label}`}
                                        onPointerDown={(e) => e.stopPropagation()}
                                        onClick={() => chooseDomain(frame.id)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); chooseDomain(frame.id); } }}>
                                        {frame.label}
                                        <tspan className="se-domain-count" dx="10">{frame.count} {frame.count === 1 ? 'schema' : 'schemas'}</tspan>
                                    </text>
                                )}
                            </g>
                        ))}
                        {showDomains && !overview && clustered.layers.map((layer) => (
                            <rect key={`panel-${layer.id}`} className="se-stage-panel" x={layer.panel.left} y={layer.panel.top} width={layer.panel.width} height={layer.panel.height} rx="8" />
                        ))}
                        {showDomains && clustered.layers.map((layer) => (
                            <g key={layer.id}>
                                <circle cx={layer.left + 3} cy={layer.top + 12} r="3" fill={stageAccent(layer.id.slice(layer.domain.length + 1))} aria-hidden="true" />
                                <text className="se-stage-label" x={layer.left + 12} y={layer.top + 18}>{layer.label}</text>
                            </g>
                        ))}
                        {drawnGroups.map((g) => {
                            if (showDomains && !routes[g.key]) return null;
                            const displayKind = g.reverse && kinds.includes('reverse') &&
                                !kinds.includes(g.kind) ? 'reverse' : g.kind;
                            const a = positions[g.from],
                                b = positions[g.to],
                                dx = b.x - a.x,
                                dy = b.y - a.y;
                            const factor = Math.min(
                                dx ? width / 2 / Math.abs(dx) : Infinity,
                                dy ? height / 2 / Math.abs(dy) : Infinity
                            );
                            const same = g.from === g.to;
                            const lane = edgeLanes.get(g.key) || 0,
                                distance = Math.hypot(dx, dy) || 1,
                                nx = -dy / distance,
                                ny = dx / distance,
                                ax = same ? a.x + 40 : a.x + dx * factor,
                                ay = same ? a.y - height / 2 : a.y + dy * factor,
                                bx = same ? a.x - 40 : b.x - dx * factor,
                                by = same ? a.y - height / 2 : b.y - dy * factor,
                                c1x = ax + dx / 3 + nx * lane,
                                c1y = ay + dy / 3 + ny * lane,
                                c2x = bx - dx / 3 + nx * lane,
                                c2y = by - dy / 3 + ny * lane,
                                cx = (ax + 3 * c1x + 3 * c2x + bx) / 8,
                                cy = (ay + 3 * c1y + 3 * c2y + by) / 8;
                            const d = same
                                ? `M${ax},${ay} C${ax + 140},${ay - 110} ${
                                    bx - 140
                                },${by - 110} ${bx},${by}`
                                : `M${ax},${ay} C${c1x},${c1y} ${c2x},${c2y} ${bx},${by}`;
                            return (
                                <g
                                    key={g.key}
                                    className={selected
                                        ? g.from === selected || g.to === selected
                                            ? 'se-active'
                                            : 'se-dim'
                                        : ''}>
                                    <path
                                        className={`se-edge ${displayKind}${hoverEdge?.key === g.key ? ' se-traced-edge' : ''}`}
                                        d={showDomains ? routes[g.key].d : d}
                                        markerEnd={`url(#${markerPrefix}-${displayKind})`}
                                        tabIndex={0}
                                        role="button"
                                        aria-label={`${g.from} to ${g.to}`}
                                        onClick={() => inspect(g)}
                                        onMouseEnter={() => setHoverEdge(g)} onMouseLeave={() => setHoverEdge(null)}
                                        onFocus={() => setHoverEdge(g)} onBlur={() => setHoverEdge(null)}
                                        onKeyDown={(e) => {
                                            if (
                                                e.key === 'Enter' ||
                                            e.key === ' '
                                            ) {
                                                e.preventDefault();
                                                inspect(g);
                                            }
                                        }}>
                                        <title>{edgeTooltip(g)}</title>
                                    </path>
                                    {(neighbors ||
                                    compact ||
                                    (!showDomains && visible.length <= 12)) && (
                                        <text
                                            className="se-edge-label"
                                            x={same ? a.x : cx}
                                            y={same ? ay - 80 : cy - 8}
                                            onClick={() => inspect(g)}>
                                            {g.edges.map((e) => e.field).join(', ')}
                                        </text>
                                    )}
                                </g>
                            );
                        })}
                        {externalBundles.map((bundle) => {
                            const p = positions[bundle.name];
                            if (!p) return null;
                            const expanded = expandedExternal.includes(bundle.id);
                            const toggle = () => { setSelected(''); setMoves({}); setExpandedExternal(expanded ? expandedExternal.filter((id) => id !== bundle.id) : [...expandedExternal, bundle.id]); };
                            const label = bundle.label.length > 32 ? `${bundle.label.slice(0, 29)}…` : bundle.label;
                            return (
                                <g key={bundle.name} data-external-group={bundle.id} className={`se-external-group-card${tracedEnds.has(bundle.name) ? ' se-traced-group' : ''}`}
                                    transform={`translate(${p.x - width / 2},${p.y - height / 2})`} role="button" tabIndex={0}
                                    aria-label={`${expanded ? 'Collapse' : 'Expand'} ${bundle.label}: ${bundle.members.length} connected schemas`} aria-expanded={expanded}
                                    onClick={toggle} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); } }}>
                                    <title>{bundle.label}</title><rect width={width} height={height} rx="8" />
                                    <text x="12" y="25" className="se-external-group-title">{label}</text>
                                    <text x="12" y="47">{bundle.members.length} connected {bundle.members.length === 1 ? 'schema' : 'schemas'} · {expanded ? 'Collapse ↑' : 'Expand →'}</text>
                                </g>
                            );
                        })}
                        {visible.map((n) => {
                            const presentation = nodePresentation(n.name, n.model, { isAbstract: abstractTypes.has(n.name) });
                            const inherited = shared.inherited[n.name];
                            const tooltip = [n.name, presentation.description,
                                n.model ? `${n.model.fields.length} fields · ${n.model.fields.filter((field) => field.calculated).length} calculated` : '',
                                inherited ? `${inherited.fields.size} inherited references from ${[...inherited.owners].join(', ')}` : '',
                            ].filter(Boolean).join('\n');
                            return (
                                <g
                                    key={n.name}
                                    data-entity={n.name}
                                    className={`entity-node${coveredByHover.has(n.name) ? ' se-covered' : ''}${tracedEnds.has(n.name) ? ' se-covered-owner' : ''}${conceptContext && conceptMembers.has(n.name) ? ' se-concept-center' : ''}${!overview && presentation.isAbstract ? ' se-node-abstract' : ''} ${
                                        selected === n.name ? 'selected' : ''
                                    } ${
                                        selected && !connected.has(n.name)
                                            ? 'se-dim'
                                            : ''
                                    }`}
                                    transform={`translate(${
                                        positions[n.name].x - cardWidth / 2
                                    },${positions[n.name].y - cardHeight / 2})`}
                                    tabIndex={0}
                                    role="button"
                                    aria-label={n.name}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            choose(n.name);
                                        }
                                    }}>
                                    <title>{tooltip}</title>
                                    {externalContextNames.has(n.name) && <text className="se-context-domain" x="0" y="-8">Other group · {domainFor(n.name) === 'administrative' ? 'Administrative metadata' : domains.find((group) => group.id === domainFor(n.name))?.label}</text>}
                                    <rect className="se-node-body" width={cardWidth} height={cardHeight} rx={overview ? 4 : 8} />
                                    <text className="se-node-title" x="12" y={overview ? 19 : 26}>
                                        {n.name}
                                    </text>
                                    {!overview && (
                                        <text x="12" y="49" className="se-subtitle">
                                            {presentation.caption}
                                        </text>
                                    )}
                                    {coveredByHover.has(n.name) && (
                                        <g aria-hidden="true">
                                            <rect className="se-covered-badge" x={cardWidth - 66} y="9" width="56" height="16" rx="4" />
                                            <text className="se-covered-label" x={cardWidth - 38} y="20">Inherits</text>
                                        </g>
                                    )}
                                    {!overview && presentation.isAbstract && (
                                        <g aria-hidden="true">
                                            <rect className="se-node-abstract-badge" x={cardWidth - 65} y="9" width="54" height="16" rx="4" />
                                            <text className="se-node-abstract-label" x={cardWidth - 38} y="20">Abstract</text>
                                        </g>
                                    )}
                                </g>
                            );
                        })}
                        {!compact && domain && !neighbors && selected && positions[selected] && externalGroups.length > 0 && (
                            <g className="se-cross-group-cue" transform={`translate(${positions[selected].x},${positions[selected].y + cardHeight / 2})`}>
                                <path className="se-cross-group-stem" d="M0,0 V7" />
                                <g role="button" tabIndex={0} aria-controls="cross-group-connections"
                                    ref={outsideCue} aria-expanded={outsideOpen}
                                    aria-label={`${selected}: show external connections in ${externalGroups.length} ${externalGroups.length === 1 ? 'group' : 'groups'}`}
                                    onPointerDown={(event) => event.stopPropagation()}
                                    onClick={(event) => { event.stopPropagation(); setOutsideOpen((open) => !open); }}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault(); event.stopPropagation(); setOutsideOpen((open) => !open);
                                        }
                                    }}>
                                    <title>{externalGroups.map((group) => `${group.label}: ${group.count} connected ${group.count === 1 ? 'schema' : 'schemas'}`).join('\n')}</title>
                                    <rect x="-105" y="7" width="210" height="19" rx="7" />
                                    <text x="0" y="20">External connections · {externalGroups.length} {externalGroups.length === 1 ? 'group' : 'groups'}</text>
                                </g>
                            </g>
                        )}
                    </g>
                    {!visible.length && (
                        <text x="20" y="35">
                            No types selected. Use Types to show schemas.
                        </text>
                    )}
                </svg>
                {!compact && domain && !neighbors && outsideOpen && externalGroups.length > 0 && (
                    <div className="se-cross-group-popover" style={{ left: outsideLeft, top: outsideTop, width: outsideWidth, maxHeight: outsideHeight }}
                        onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeOutside(); } }}>
                        <CrossGroupConnections key={selected} selected={selected} groups={externalGroups} sectionRef={outsidePanel}
                            onChoose={choose} onInspect={inspect} onShowAll={showConnected} onClose={closeOutside} />
                    </div>
                )}
            </div>
            {selected && (
                <section id={compact ? 'relations' : 'entity-details'} className="se-selected-panel" aria-label={`${selected} relationships`}>
                    {/* On the item page the focused schema is already the page heading, so only its links are listed. */}
                    {!(compact && selected === focus) && (
                        <header>
                            <div>
                                <span className="se-diagram-eyebrow">Selected schema</span>
                                <h3>{selected}</h3>
                                {selectedDescription && <p>{selectedDescription}</p>}
                            </div>
                            {!compact
                                ? <button type="button" className="se-selected-open" onClick={() => onExplore(selected)}>Open schema details →</button>
                                : <button type="button" onClick={clearSelection}>Clear selection</button>}
                        </header>
                    )}
                    {shared.inherited[selected] && <p className="se-inheritance-detail">{shared.inherited[selected].fields.size} reference fields inherited from { [...shared.inherited[selected].owners].join(', ') }. Their shared definitions are drawn at the base types in the group overview.</p>}
                    {[
                        { key: 'out', title: 'Links from this schema', rows: incident.filter((e) => e.from === selected), column: 'Links to' },
                        { key: 'in', title: 'Links to this schema', rows: incident.filter((e) => e.from !== selected), column: 'Linked from' },
                    ].filter((part) => part.rows.length).map((part) => (
                        <div className="se-relationship-section" key={part.key}>
                            <h5 className="se-relationship-section-title">{part.title} <span>{part.rows.length}</span></h5>
                            <table className="se-selected-table">
                                <colgroup><col className="se-col-schema" /><col /><col className="se-col-kind" /><col className="se-col-action" /></colgroup>
                                <thead><tr><th scope="col">{part.column}</th><th scope="col">Field</th><th scope="col">Kind</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
                                <tbody>
                                    {part.rows.map((e) => (
                                        <tr key={`${e.from}-${e.field}-${e.to}-${e.kind}`}>
                                            <th scope="row">
                                                <button type="button" className="se-selected-schema" onClick={() => choose(part.key === 'out' ? e.to : e.from)}>{part.key === 'out' ? e.to : e.from}</button>
                                            </th>
                                            <td><code>{e.field}</code></td>
                                            <td><Badge kind={e.kind}>{edgeLabel(e)}</Badge></td>
                                            <td className="se-selected-action"><button type="button" onClick={() => inspect({ ...e, edges: [e] })}>Details →</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                    {!incident.length && <p className="se-flow-note">No visible links. Turn on more relationship kinds under Relationships, or show more types.</p>}
                </section>
            )}
        </section>
    );
}
