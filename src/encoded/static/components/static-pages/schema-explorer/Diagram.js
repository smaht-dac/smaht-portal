import React, {
    useState,
    useMemo,
    useRef,
    useEffect,
    useCallback,
} from 'react';
import { layout, width, height } from './layout';
import { domains, domainFor, hierarchicalLayout, abstractTypes } from './domains';
import { routeEdges, panelRoutes } from './routing';
import { groupRelationships, sharedRelationships, panelRelationships } from './relationship-view';
import { nodePresentation, stageAccent } from './node-presentation';
import ResearchOverview, { ConceptSummary } from './ResearchOverview';
import { explorerIndex } from './explorer-scope';
import { externalContextGroups } from './external-context';
import { mapSentence, researchLabels, buildResearchMap, concepts } from './research-map';
import { conceptConnections } from './concept-connections';
import { overviewRoute } from './explorer-route';
import { neighborhoodLayout } from './neighborhood';
import CrossGroupConnections, { outsideConnections } from './CrossGroupConnections';
import { Badge, Filters, visibleEdge, edgeLabel, exportPNG, InfoPopover } from './shared';

const defaults = [];
const colors = { linkTo: '#2368aa', calculated: '#7952a3', reverse: '#986019' };
export default function Diagram({
    index: sourceIndex,
    onDetail,
    onPlanner,
    onBrowseAll,
    route = overviewRoute,
    onNavigate,
    renderSchema,
}) {
    const index = useMemo(() => explorerIndex(sourceIndex), [sourceIndex]);
    const [selected, setSelected] = useState('');
    const [outsideOpen, setOutsideOpen] = useState(false);
    const [expandedExternal, setExpandedExternal] = useState([]);
    const [showExternal, setShowExternal] = useState(true);
    const [arrangement, setArrangement] = useState('hierarchical');
    const [crossLinks, setCrossLinks] = useState(true);
    // Group maps open with arrows between panels; schema-level arrows come with a selection or on request.
    const [connectionMode, setConnectionMode] = useState('panels');
    const [hidden, setHidden] = useState(defaults);
    // Links and their reverse links are drawn by default; calculated relationships are opt-in.
    const [kinds, setKinds] = useState(['linkTo', 'reverse']);
    // A neighborhood answers "what is this schema connected to", so it opens with every relationship kind;
    // leaving it restores the filter the group map had, which stays deliberately sparse.
    const kindsBeforeNeighborhood = useRef(null);
    // The arrow under the pointer or keyboard focus; its covered schemas are outlined.
    const [hoverState, setHoverEdge] = useState(null);
    // A panel arrow the reader opened: drawn as the schema-to-schema arrows it carries.
    const [openedArrow, setOpened] = useState(null);
    // The arrow or label just clicked disappears as the map redraws, so it never reports the pointer leaving it.
    const setOpenedArrow = (key) => { setHoverEdge(null); setOpened(key); };
    const [neighbors, setNeighbors] = useState(false),
        [full, setFull] = useState(false);
    const [typeQuery, setTypeQuery] = useState('');
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
    const markerPrefix = 'entity-arrow';
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
        return [...models.keys()].sort().map((name) => {return { name, model: models.get(name) };});
    }, [index]);
    // The metadata map always draws the whole model, also above a concept's Map tab where `visible` is one group.
    const overviewNodes = useMemo(() => nodes.filter((n) => !hidden.includes(n.name)), [nodes, hidden]);
    // The explorer's route says which group, concept or schema is shown.
    const conceptGraph = useMemo(() => buildResearchMap(index, overviewNodes), [index, overviewNodes]);
    const conceptContext = useMemo(() => {
        if (route.view !== 'concept') return null;
        const node = conceptGraph.nodes.find((n) => n.id === route.concept);
        return node ? { id: node.id, label: node.label, hint: node.hint, domain: node.domain, members: node.members,
            connections: conceptConnections(index, node, conceptGraph, overviewNodes), origin: 'concept' } : null;
    }, [route.view, route.concept, conceptGraph, index, overviewNodes]);
    const domain = route.view === 'group' ? route.group : route.view === 'schema' ? domainFor(route.schema)
        : conceptContext?.domain || '';
    // Group and concept maps open with their links to other groups drawn; each new map starts that way again.
    useEffect(() => { setShowExternal(true); }, [conceptContext?.id, domain]);
    useEffect(() => { setExpandedExternal([]); }, [conceptContext?.id, domain]);
    // Moving to another group or concept starts from its whole map. A schema's address is its group map with the
    // schema selected, so moving between schemas of one group keeps the map as it is and only changes the selection.
    const routeKey = route.view === 'concept' ? `concept:${route.concept}` : `${domain ? 'group' : route.view}:${domain}`;
    useEffect(() => {
        if (route.view !== 'schema') setSelected('');
    }, [route.view, route.concept, route.group]);
    useEffect(() => {
        if (route.view === 'schema') setSelected(route.schema);
    }, [route.view, route.schema]);
    useEffect(() => {
        setNeighbors(false);
        setMoves({});
        setConnectionMode('panels');
        // The card or arrow being pointed at belongs to the previous map.
        setHoverEdge(null);
        setOpenedArrow(null);
        if (route.view === 'concept') setArrangement('hierarchical');
    }, [routeKey]);
    const edges = useMemo(
        () =>
            index.edges.filter(
                (e) => visibleEdge(e, kinds)
            ),
        [index, kinds]
    );
    useEffect(() => { setOutsideOpen(false); }, [selected, domain, neighbors, showExternal]);
    useEffect(() => {
        if (neighbors && !kindsBeforeNeighborhood.current) {
            kindsBeforeNeighborhood.current = kinds;
            setKinds(['linkTo', 'calculated', 'reverse']);
        } else if (!neighbors && kindsBeforeNeighborhood.current) {
            setKinds(kindsBeforeNeighborhood.current);
            kindsBeforeNeighborhood.current = null;
        }
    }, [neighbors]);
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
    const neighborhoodSelection = neighbors ? selected : '';
    // The neighborhood draws only the selected schema's own links. With shared definitions, a reference
    // inherited by several subtypes is drawn once from the base that defines it, as in the group map.
    const neighborhood = useMemo(() => {
        if (!neighborhoodSelection) return null;
        const candidates = new Set([...connected].filter((name) => !hidden.includes(name)));
        const incident = groupRelationships(edges.filter((e) => (e.from === neighborhoodSelection || e.to === neighborhoodSelection) &&
            candidates.has(e.from) && candidates.has(e.to)));
        const collapsed = connectionMode !== 'all' ? sharedRelationships(index, incident, candidates) : { groups: incident, inherited: {} };
        return { candidates, groups: collapsed.groups, inherited: collapsed.inherited,
            names: new Set([neighborhoodSelection, ...collapsed.groups.flatMap((g) => [g.from, g.to])]) };
    }, [neighborhoodSelection, connected, hidden, edges, connectionMode, index]);
    const visibleConnected = neighbors ? neighborhood?.names || connected : null;
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
    const showDomains = !neighbors && arrangement === 'hierarchical';
    // Without a group the hierarchical view is the curated research map; every other view is a group map.
    const researchOverview = showDomains && !domain;
    // The metadata map overview draws its own canvas, so canvas listeners attach again when a group or concept opens.
    const canvasShown = !researchOverview;
    const cardWidth = width, cardHeight = height;
    // Group maps shrink the canvas to their content, so layout and
    // fitting use the full canvas budget (65vh, min 400px as in the stylesheet) rather than the measured height.
    const groupMap = showDomains && !researchOverview;
    const fitToContent = groupMap;
    const budgetHeight = Math.max(400, windowHeight * 0.65);
    const layoutSize = useMemo(() => fitToContent ? { width: size.width, height: budgetHeight } : size,
        [fitToContent, size.width, fitToContent ? budgetHeight : size.height]);
    const allPositions = useMemo(() => showDomains ? {} : layout(visible, groups, layoutSize), [showDomains, visible, groups, layoutSize]);
    const clustered = useMemo(() => {
        if (!showDomains) return { positions: {}, frames: [], layers: [] };
        if (researchOverview) return { positions: {}, frames: [], layers: [] };
        const result = hierarchicalLayout(visible.filter((node) => !externalContextNames.has(node.name)), width, height, index.edges, layoutSize, concepts, { gap: 96, columnGap: 140 });
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
    }, [showDomains, researchOverview, visible, index, size, layoutSize, externalContextNames, externalBundles, expandedExternal]);
    const neighborhoodView = useMemo(() => neighborhood
        ? neighborhoodLayout(neighborhoodSelection, neighborhood.groups, width, height) : null,
    [neighborhood, neighborhoodSelection]);
    const positions = useMemo(() => {
        if (neighborhoodView) return { ...neighborhoodView.positions, ...moves };
        return { ...(showDomains ? clustered.positions : allPositions), ...moves };
    }, [allPositions, moves, neighborhoodView, showDomains, clustered]);
    const visibleGroups = useMemo(() => groups.filter(
        (g) => names.has(g.from) && names.has(g.to) &&
            (!showDomains || (showExternal && (externalContextNames.has(g.from) || externalContextNames.has(g.to))) || domainFor(g.from) === domainFor(g.to) || (crossLinks && (g.from === selected || g.to === selected)))
    ), [groups, names, showDomains, selected, crossLinks, showExternal, externalContextNames]);
    const scopedGroups = useMemo(() => visibleGroups.filter(
        (g) => (!showDomains || !selected || g.from === selected || g.to === selected)
    ), [visibleGroups, showDomains, selected]);
    const shared = useMemo(() => neighborhood ? { groups: neighborhood.groups, inherited: neighborhood.inherited }
        : showDomains ? sharedRelationships(index, visibleGroups, names)
            : { groups: visibleGroups, inherited: {} }, [neighborhood, showDomains, index, visibleGroups, names]);
    const summarize = showDomains && !selected && connectionMode === 'shared';
    // The default group map: one arrow per pair of panels (or panel and group card), carrying all its references.
    const panelMode = showDomains && !selected && connectionMode === 'panels';
    const panelView = useMemo(() => {
        if (!panelMode) return null;
        const owners = new Map(clustered.layers.flatMap((layer) => layer.names.map((name) => [name, layer.id])));
        const cards = {};
        for (const name of names) if (!owners.has(name) && positions[name]) { owners.set(name, name); cards[name] = { ...positions[name], width: cardWidth, height: cardHeight }; }
        for (const bundle of externalBundles) {
            if (expandedExternal.includes(bundle.id) || !positions[bundle.name]) continue;
            // Sized, so arrows routed around the map keep clear of the cards.
            cards[bundle.name] = { ...positions[bundle.name], width, height };
            bundle.members.forEach((name) => owners.set(name, bundle.name));
        }
        const referenced = edges.filter((e) => showExternal || (domainFor(e.from) === domain && domainFor(e.to) === domain));
        const { groups: all, inside } = panelRelationships(referenced, owners);
        // Arrows join panels only. A group card's links are counted on the card and traced from it on hover,
        // so the cards on the right do not gather a sheaf of long arrows.
        const panelIds = new Set(clustered.layers.map((layer) => layer.id));
        const arrows = all.filter((g) => panelIds.has(g.from) && panelIds.has(g.to));
        const cardLinks = new Map();
        for (const g of all.filter((group) => !arrows.includes(group))) {
            const card = panelIds.has(g.from) ? g.to : g.from, panel = card === g.from ? g.to : g.from;
            if (!cardLinks.has(card)) cardLinks.set(card, { count: 0, panels: new Set(), edges: [] });
            const entry = cardLinks.get(card);
            entry.count += g.edges.length; entry.panels.add(panel); entry.edges.push(...g.edges);
        }
        const boxes = Object.fromEntries(clustered.layers.map((layer) => [layer.id,
            { x: layer.panel.left + layer.panel.width / 2, y: layer.panel.top + layer.panel.height / 2, width: layer.panel.width, height: layer.panel.height }]));
        const labels = new Map([...clustered.layers.map((layer) => [layer.id, layer.label]),
            ...externalBundles.map((bundle) => [bundle.name, bundle.label])]);
        const members = new Map(clustered.layers.map((layer) => [layer.id, layer.names]));
        externalBundles.forEach((bundle) => members.set(bundle.name, bundle.members));
        return { groups: arrows, inside, cardLinks, anchors: { ...cards, ...boxes }, labels, members };
    }, [panelMode, clustered, names, positions, externalBundles, expandedExternal, edges, showExternal, domain]);
    const schemaGroups = useMemo(() => {
        const result = neighborhood ? neighborhood.groups : summarize ? shared.groups.filter((group) => group.from !== group.to) : scopedGroups;
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
    }, [neighborhood, summarize, shared, scopedGroups, externalBundles, expandedExternal, edges, focusMembers, index, names]);
    // An opened panel arrow is drawn as the schema-to-schema arrows it carries, each labelled with its field; the
    // other panel arrows step aside until it is closed.
    const openedPanel = panelView && openedArrow ? panelView.groups.find((g) => g.key === openedArrow) || null : null;
    // Inherited references are drawn once at their base type, as with shared definitions.
    const schemaArrowsOf = useCallback((panelGroup) => sharedRelationships(index, groupRelationships(panelGroup.edges), names).groups
        .filter((g) => g.from !== g.to), [index, names]);
    const shownGroups = useMemo(() => (openedPanel
        ? schemaArrowsOf(openedPanel).map((g) => { return { ...g, key: `open:${g.key}`, opened: true }; })
        : panelView ? panelView.groups : schemaGroups), [openedPanel, panelView, schemaGroups, schemaArrowsOf]);
    // Only a panel arrow that stands for several schema arrows opens; one that stands for a single arrow already
    // shows all there is, so a click goes straight to its details.
    const opensInto = useMemo(() => new Map((panelView?.groups || []).map((g) => [g.key, schemaArrowsOf(g).length])), [panelView, schemaArrowsOf]);
    const activate = (g) => {
        if (g.panel && (opensInto.get(g.key) || 0) > 1) setOpenedArrow(g.key); else inspect(g);
    };
    // While an arrow is open its schemas stay marked and the rest of the map steps back, as when pointing at it.
    const openedTrace = useMemo(() => openedPanel && { key: 'opened', keys: new Set(shownGroups.map((g) => g.key)), edges: openedPanel.edges,
        ends: new Set([openedPanel.from, openedPanel.to, ...openedPanel.edges.flatMap((e) => [e.from, e.to])]) }, [openedPanel, shownGroups]);
    const hoverEdge = hoverState || openedTrace;
    // Leaving the panel view, or changing what it draws, closes the opened arrow.
    useEffect(() => { setOpened(null); }, [connectionMode, selected, kinds, showExternal]);
    // A single group is named in the toolbar, so its title stays readable at every zoom level.
    const singleFrame = showDomains && clustered.frames.length === 1 ? clustered.frames[0] : null;
    // Explains only the node styles currently drawn; external schemas appear individually or bundled by group depending on how many there are.
    const legend = showDomains ? [
        ['schema', 'Schema in this group'],
        visible.some((n) => abstractTypes.has(n.name)) && ['abstract', 'Abstract base type (shared fields)'],
        conceptContext && ['center', `In focus: ${conceptContext.label}`],
        externalContextNames.size > 0 && ['external', 'Schema from another group (labelled above the card)'],
        externalBundles.some((bundle) => !expandedExternal.includes(bundle.id)) && ['bundle', 'Another group, collapsed: Expand to list its schemas'],
        summarize && ['covered', 'Hover an arrow to trace it; an arrow from a base type also marks the subtypes that inherit it'],
        panelMode ? ['arrow', 'Arrow joins two panels and carries every reference between them; click it to draw those references (one that stands for a single reference opens its details)']
            : ['arrow', 'Arrow points to the referenced schema'],
    ].filter(Boolean) : [];
    // The reading note for the current view; it moved with the legend into the canvas info popover.
    const guideNote = selected ? ''
        : conceptContext ? `Highlighted schemas belong to ${conceptContext.label}.${panelMode ? ' Arrows join panels; select a schema for its own links.' : ''} Drag to pan; scroll to zoom.`
            : !showDomains ? 'Drag the background to pan, scroll to zoom, or drag a type to move it. Select a type to highlight its neighbors; select an edge to inspect its fields.'
                : panelMode ? 'Arrows join panels. Select a schema for its own links, or choose Shared definitions under Connections for every schema arrow.'
                    : summarize ? 'Inherited references are drawn once at their visible base type. Select a type for its exact links, including self-references, or choose All references.'
                        : 'All references are expanded. Select a type to focus its connections, or choose Shared definitions to combine inherited links.';
    const title = neighbors ? selected
        : singleFrame?.label || domains.find((d) => d.id === domain)?.label || 'All schemas';
    const eyebrow = neighbors ? 'Schema neighborhood' : domain ? 'Schema group' : '';
    const headingCount = neighbors ? visible.length : singleFrame?.count ?? visible.length;
    // Routed views draw orthogonal arrows around cards and headings: group maps and neighborhoods.
    const routed = showDomains || !!neighborhoodView;
    const headings = useMemo(() => neighborhoodView ? neighborhoodView.panels : showDomains ? [
        ...clustered.frames.map((frame) => {return { left: frame.left + 18, top: frame.top + 12, width: Math.min(frame.width - 36, frame.label.length * 15 + 12), height: 38 };}),
        ...clustered.layers,
        ...[...externalContextNames].filter((name) => positions[name]).map((name) => {return { left: positions[name].x - width / 2, top: positions[name].y - height / 2 - 20, width, height: 18 };}),
    ] : [], [neighborhoodView, showDomains, clustered, externalContextNames, positions]);
    // Panel arrows run between panel boxes and group cards, so the schema cards inside panels are not obstacles.
    // Facing panels get one straight arrow through their gap; only the rest are routed around the panels.
    // The routes one router drew, as segments the other must not run along.
    const segmentsOf = (drawn) => Object.values(drawn).flatMap((route) => route.points.slice(1).map((p, i) => [route.points[i], p]));
    const routes = useMemo(() => {
        if (openedPanel) {
            // An opened arrow's schema arrows run between cards with the panel router's rules: each meets a card at its
            // own point and keeps a lane of its own; the few it cannot shape are routed around the cards.
            const cards = Object.fromEntries(visible.filter((n) => positions[n.name]).map((n) => [n.name, { ...positions[n.name], width: cardWidth, height: cardHeight }]));
            // Panel titles are obstacles too, so no arrow runs through one.
            clustered.layers.filter((layer) => layer.panel).forEach(({ id, label, panel }) => {
                const titleWidth = Math.min(panel.width, (label || '').length * 10 + 140);
                cards[`title:${id}`] = { x: panel.left + titleWidth / 2, y: panel.top + 20, width: titleWidth, height: 40 };
            });
            // Card sides are short, so ends sit closer than on panels. An arrow with a card in its way runs as a U along
            // the nearest clear lane past its two cards.
            // Panel frames are lines too: an arrow whose lane sits on one reads as part of the frame, so lanes keep off them.
            const frames = clustered.layers.filter((layer) => layer.panel).flatMap(({ panel }) => {
                const { left, top } = panel, right = left + panel.width, bottom = top + panel.height;
                return [[{ x: left, y: top }, { x: left, y: bottom }], [{ x: right, y: top }, { x: right, y: bottom }],
                    [{ x: left, y: top }, { x: right, y: top }], [{ x: left, y: bottom }, { x: right, y: bottom }]];
            });
            const own = panelRoutes(cards, shownGroups, { spacing: 14, lane: 18, around: 'ends', frames });
            return { ...routeEdges(positions, shownGroups.filter((g) => !own[g.key]), width, height, headings, { spreadPorts: true, avoid: segmentsOf(own) }), ...own };
        }
        if (panelView) {
            const own = panelRoutes(panelView.anchors, shownGroups);
            return { ...routeEdges(panelView.anchors, shownGroups.filter((g) => !own[g.key]), width, height, [], { spreadPorts: true, avoid: segmentsOf(own) }), ...own };
        }
        return routed ? routeEdges(positions, shownGroups, width, height, headings, { spreadPorts: true }) : {};
    }, [panelView, openedPanel, routed, positions, shownGroups, headings, visible, cardWidth, cardHeight, clustered]);
    // A panel arrow's ends are panels; the label names the panel, and its schemas are traced with it.
    const endLabel = (name) => panelView?.labels.get(name) || externalBundles.find((bundle) => bundle.name === name)?.label || name;
    const panelTrace = (g) => { return { ...g, ends: new Set([g.from, g.to, ...(panelView.members.get(g.from) || [g.from]), ...(panelView.members.get(g.to) || [g.to])]) }; };
    const bounds = useMemo(() => {
        // The research map lays out its own nodes, so this view has no positions of its own.
        const points = visible.filter((n) => positions[n.name]).flatMap((n) => [
            { x: positions[n.name].x - cardWidth / 2, y: positions[n.name].y - cardHeight / 2 },
            { x: positions[n.name].x + cardWidth / 2, y: positions[n.name].y + cardHeight / 2 },
        ]);
        externalBundles.forEach((group) => {
            const p = positions[group.name];
            if (p) points.push({ x: p.x - width / 2, y: p.y - height / 2 }, { x: p.x + width / 2, y: p.y + height / 2 });
        });
        if (neighborhoodView) {
            neighborhoodView.panels.forEach(({ panel }) => points.push({ x: panel.left, y: panel.top }, { x: panel.left + panel.width, y: panel.top + panel.height }));
            Object.values(routes).forEach((route) => points.push(...route.points));
        }
        if (showDomains) {
            // A single group's title lives in the toolbar, so its reserved heading band is not content.
            const contentTop = (f) => singleFrame ? Math.min(...clustered.layers.map((layer) => layer.panel?.top ?? layer.top)) : f.top;
            clustered.frames.forEach((f) => points.push({ x: f.left, y: contentTop(f) }, { x: f.left + f.width, y: f.top + f.height }));
            Object.values(routes).forEach((route) => points.push(...route.points));
            // An arrow run around the outside of the panels carries its label there, so its chip's width is content too.
            if (panelView) {
                const left = Math.min(...clustered.frames.map((f) => f.left)), right = Math.max(...clustered.frames.map((f) => f.left + f.width));
                // An opened arrow's schema arrows run anywhere around the cards, so any of their points may carry a label.
                Object.values(routes).flatMap((route) => route.points).filter((p) => openedPanel || p.x < left || p.x > right)
                    .forEach((p) => points.push({ x: p.x - 70, y: p.y }, { x: p.x + 70, y: p.y }));
            }
        }
        return points.length ? {
            left: Math.min(...points.map((p) => p.x)) - (routed ? 20 : 65),
            right: Math.max(...points.map((p) => p.x)) + (routed ? 20 : 65),
            top: Math.min(...points.map((p) => p.y)) - (routed ? 20 : 90),
            bottom: Math.max(...points.map((p) => p.y)) + (routed ? 20 : 65),
        } : { left: -300, right: 300, top: -200, bottom: 200 };
    }, [visible, positions, showDomains, neighborhoodView, routed, clustered, routes, cardWidth, cardHeight, externalBundles, singleFrame, panelView, openedPanel]);
    const fitScale = useCallback((readable = true) => {
        const fitted = Math.min(
            showDomains ? 1.25 : 1.5,
            layoutSize.width / (bounds.right - bounds.left),
            layoutSize.height / (bounds.bottom - bounds.top)
        );
        return Math.max(showDomains && readable ? externalBundles.length ? 0.65 : 0.85 : 0.05, fitted);
    }, [bounds.left, bounds.right, bounds.top, bounds.bottom, layoutSize, showDomains, externalBundles.length]);
    // Set once the reader zooms, pans or drags, so automatic refits stop overriding their view.
    const cameraTouched = useRef(false);
    const fit = useCallback((readable = true) => {
        cameraTouched.current = false;
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
    const layoutFocus = neighbors ? selected : '';
    // A map that fits its content sizes its canvas from a fixed height budget, so its own canvas growing or
    // shrinking (as the drawn arrows change) must not refit and move the reader's view; only width changes do.
    const fitHeight = fitToContent ? 0 : size.height;
    useEffect(() => {
        fit();
    }, [index, hidden, kinds, neighbors, layoutFocus, size.width, fitHeight, full, domain, arrangement, connectionMode, conceptContext, expandedExternal, showExternal, openedArrow]);
    // A neighborhood settles over a few renders (relationship kinds, routes, the canvas growing to its own height);
    // until the reader moves the view, it is refitted to whatever it finally measures.
    useEffect(() => {
        if (neighborhoodView && !cameraTouched.current) fit();
    }, [neighborhoodView, fit]);
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
    }, [canvasShown]);
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
    const zoom = (factor, x = size.width / 2, y = size.height / 2) => {
        cameraTouched.current = true;
        setCamera((c) => {
            const scale = Math.max(0.05, Math.min(3, c.scale * factor));
            return {
                scale,
                x: x - ((x - c.x) * scale) / c.scale,
                y: y - ((y - c.y) * scale) / c.scale,
            };
        });
    };
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
    }, [canvasShown]);
    // Choosing a schema on a group map opens its address (its group map with it selected). On a concept page a
    // schema of the concept's group is selected in place, so the concept stays open.
    const choose = useCallback((name) => {
        if (hidden.includes(name)) setHidden(hidden.filter((n) => n !== name));
        if (!neighbors && !externalContextNames.has(name) && (domain || showDomains)
            && (route.view !== 'concept' || domainFor(name) !== domain)) {
            // Selected at once, so the map answers the click without waiting for the address to change.
            if (domainFor(name) === domain) setSelected(name);
            onNavigate({ view: 'schema', schema: name });
            return;
        }
        setSelected(name);
        if (neighbors) setMoves({});
    }, [neighbors, domain, showDomains, hidden, externalContextNames, onNavigate, route.view]);
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
            title: group.panel ? `${endLabel(group.from)} → ${endLabel(group.to)}`
                : group.bundled ? `${conceptContext?.label || domains.find((d) => d.id === domain)?.label}: external relationships` : `${group.from} → ${group.to}`,
            value: group.edges,
            relationship: group.edges,
            intro: group.panel ? `Every reference from a schema in ${endLabel(group.from)} to one in ${endLabel(group.to)}. [] denotes an array.`
                : group.shared
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
    const chooseDomain = useCallback((id) => onNavigate(id ? { view: 'group', group: id } : overviewRoute), [onNavigate]);
    const clearSelection = () => {
        setSelected('');
        if (route.view === 'schema') onNavigate({ view: 'group', group: domain });
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
    // Schemas inside a collapsed external group are drawn through that group's card, so their links count as visible.
    const drawnNames = useMemo(() => new Set([...names, ...(neighborhood?.candidates || []), ...externalBundles
        .filter((bundle) => !expandedExternal.includes(bundle.id)).flatMap((bundle) => bundle.members)]),
    [names, neighborhood, externalBundles, expandedExternal]);
    const incident = edges.filter(
        (e) =>
            (e.from === selected || e.to === selected) &&
            drawnNames.has(e.from) &&
            drawnNames.has(e.to)
    );
    // The first tooltip line names the arrow as drawn (a shared base or a collapsed group can stand in
    // for the exact endpoints); the exact schema references follow.
    const edgeTooltip = (g) => {
        const end = endLabel;
        const heirs = new Set(g.edges.map((e) => e.from).filter((name) => name !== g.from)).size;
        const note = g.shared && heirs ? ` · defined on ${g.from}, inherited by ${heirs} ${heirs === 1 ? 'schema' : 'schemas'}` : '';
        const header = `${end(g.from)} → ${end(g.to)}${note}`;
        const sentence = g.edges.map(mapSentence).find(Boolean);
        const map = sentence ? `\n\nOn the Donor to data map: ${sentence.text}` : '';
        return `${header}\n\n${g.edges.map((e) => `${e.from}.${e.field} → ${e.to}`).join('\n')}${map}`;
    };
    // The map verb next to the exact field ties a schema arrow to its Donor to data sentence.
    const edgeCaption = (g) => {
        if (g.panel) {
            const unique = [...new Set(g.edges.map((e) => e.field))];
            return unique.length === 1 ? unique[0] : `${unique.length} fields`;
        }
        const fields = [...new Set(g.edges.map((e) => e.field))].join(', ');
        const sentence = g.edges.map(mapSentence).find(Boolean);
        const heirs = g.shared ? new Set(g.edges.map((e) => e.from).filter((name) => name !== g.from)).size : 0;
        return [fields, sentence?.verb, heirs && `+${heirs} ${heirs === 1 ? 'subtype' : 'subtypes'}`].filter(Boolean).join(' · ');
    };
    // Neighborhood labels reuse the metadata map's placement: each sits on its arrow's longest run,
    // clear of every card and of the labels placed before it.
    // A panel arrow's label sits on the arrow itself as a small chip: in the middle of a straight arrow, or on the
    // first run of a routed one that holds it, so it is never read as belonging to a neighbouring line.
    const panelLabels = (() => {
        if (!panelView) return {};
        // Chips already placed; a chip that would cover one slides along its own arrow until it is clear.
        const placed = [];
        // Schema cards and panel titles are kept readable: a chip never sits on one when another place is free.
        const cards = visible.filter((n) => positions[n.name] && !externalContextNames.has(n.name)).map((n) => {
            return { x: positions[n.name].x, y: positions[n.name].y, width: cardWidth, height: cardHeight };
        });
        const titles = clustered.layers.filter((layer) => layer.panel).map((layer) => {
            return { x: layer.panel.left + 18 + (layer.label || '').length * 5, y: layer.panel.top + 21, width: (layer.label || '').length * 10 + 120, height: 24 };
        });
        const onCard = (c) => [...cards, ...titles].some((r) => Math.abs(r.x - c.x) < (r.width + c.width) / 2 + 2 && Math.abs(r.y - c.y) < r.height / 2 + 11);
        const onChip = (c) => placed.some((p) => Math.abs(p.x - c.x) < (p.width + c.width) / 2 + 4 && Math.abs(p.y - c.y) < 20);
        const overlaps = (c) => onCard(c) || onChip(c);
        // A chip on another arrow's line (worst of all, on a crossing) would read as that arrow's label.
        const runsOf = (key) => routes[key].points.slice(1).map((q, i) => [routes[key].points[i], q]);
        const onOtherLine = (c, key) => shownGroups.some((g) => g.key !== key && routes[g.key] && runsOf(g.key).some(([p, q]) =>
            Math.max(p.x, q.x) >= c.x - c.width / 2 - 3 && Math.min(p.x, q.x) <= c.x + c.width / 2 + 3 &&
            Math.max(p.y, q.y) >= c.y - 12 && Math.min(p.y, q.y) <= c.y + 12));
        return Object.fromEntries(shownGroups.filter((g) => routes[g.key]).map((g) => {
            const { points, straight } = routes[g.key];
            // The chip names one field by its last step, at most 16 characters of it, and several by their count; the
            // full paths are in the arrow's tooltip and in the details it opens.
            const fieldNames = [...new Set(g.edges.map((e) => e.field))];
            const field = fieldNames.length === 1 ? fieldNames[0].split('.').pop() : `${fieldNames.length} fields`;
            // An opened arrow has the map to itself, so its labels may be longer.
            const room = g.opened ? 26 : 16;
            const text = field.length > room ? `${field.slice(0, room - 1)}…` : field, chipWidth = text.length * 6.6 + 14;
            // Runs long enough to hold the chip come first, in order along the arrow; then the rest, longest first.
            const runs = points.slice(1).map((end, i) => [points[i], end]);
            const length = ([p, q]) => Math.hypot(q.x - p.x, q.y - p.y);
            const fits = ([p, q]) => (p.y === q.y ? Math.abs(q.x - p.x) >= chipWidth + 16 : Math.abs(q.y - p.y) >= 40);
            const ordered = straight ? runs.slice(0, 1) : [...runs.filter(fits), ...runs.filter((r) => !fits(r)).sort((x, y) => length(y) - length(x))];
            // Places on one run: along it from its middle outwards, then (for a vertical run) just beside it.
            const placesOn = ([a, b]) => {
                const run = length([a, b]) || 1;
                // A short straight arrow across a gap would vanish under its chip, so a horizontal one carries it just above.
                const lift = straight && a.y === b.y ? 12 : 0;
                const at = (d) => { return { x: a.x + (b.x - a.x) * d / run, y: a.y + (b.y - a.y) * d / run - lift, width: chipWidth, text, lineX: a.x === b.x ? a.x : undefined }; };
                const margin = Math.min(run / 2, a.y === b.y ? chipWidth / 2 + 4 : 12);
                const middle = straight ? run / 2 : Math.min(run / 2, Math.max(44, margin));
                const offsets = [];
                for (let d = margin; d <= run - margin; d += 12) offsets.push(d);
                offsets.sort((x, y) => Math.abs(x - middle) - Math.abs(y - middle));
                const centred = at(Math.min(run - margin, Math.max(margin, middle)));
                const beside = a.x === b.x ? [1, -1].map((side) => { return { ...centred, x: a.x + side * (chipWidth / 2 + 5) }; }) : [];
                return { places: [...offsets.map(at), ...beside], centred };
            };
            const options = ordered.map(placesOn);
            const places = options.flatMap((o) => o.places);
            // Best: clear of cards, chips and other lines; then clear of cards and chips; at worst on a card, but never on
            // another chip, where neither would be readable.
            let chip = places.find((c) => !overlaps(c) && !onOtherLine(c, g.key)) || places.find((c) => !overlaps(c)) || places.find((c) => !onChip(c));
            const { centred } = options[0];
            if (!chip && centred.lineX !== undefined) {
                // Two vertical arrows close together across a short gap (often a pair running both ways) have no
                // room to slide, so their chips step out to the outer side of their own lines.
                const other = placed.find((p) => p.lineX !== undefined && Math.abs(p.x - centred.x) < (p.width + centred.width) / 2 + 4 && Math.abs(p.y - centred.y) < 20);
                if (other) {
                    const away = other.lineX < centred.lineX ? 1 : -1;
                    other.x = other.lineX - away * (other.width / 2 + 5);
                    chip = { ...centred, x: centred.lineX + away * (chipWidth / 2 + 5) };
                }
            }
            chip = chip || centred;
            placed.push(chip);
            return [g.key, chip];
        }));
    })();
    const neighborhoodLabels = neighborhoodView ? researchLabels({
        nodes: visible.map((n) => {return { id: n.name };}),
        positions, nodeWidth: width, nodeHeight: height,
        edges: shownGroups.map((g) => {return { key: g.key, label: edgeCaption(g) };}),
    }, routes, { avoidRoutes: true }) : {};
    // Hovering any arrow traces it: both ends are marked and the rest of the map steps back. An arrow drawn
    // once from a base type also marks the subtypes that inherit it, so the shared definition stays visible.
    // With shared definitions a subtype's inherited references are drawn at its base, so its own card
    // would look unconnected; a tag on the card names the base and traces those arrows on hover.
    const inheritedTags = useMemo(() => {
        const tags = new Map();
        if (!summarize) return tags;
        for (const g of shownGroups) {
            if (!g.shared) continue;
            for (const e of g.edges) {
                if (e.from === g.from || !names.has(e.from)) continue;
                if (!tags.has(e.from)) tags.set(e.from, { keys: new Set(), owners: new Set(), ends: new Set(), edges: [], groups: [] });
                const tag = tags.get(e.from);
                if (!tag.keys.has(g.key)) { tag.keys.add(g.key); tag.groups.push(g); tag.ends.add(g.from); tag.ends.add(g.to); }
                tag.owners.add(g.from);
                tag.edges.push(e);
            }
        }
        return tags;
    }, [summarize, shownGroups, names]);
    const traceInherited = (name) => {
        const tag = inheritedTags.get(name);
        return { key: `inherited:${name}`, keys: tag.keys, ends: tag.ends, shared: true, from: [...tag.owners][0], edges: tag.edges };
    };
    const inspectInherited = (name) => {
        const tag = inheritedTags.get(name);
        inspect(tag.groups.length === 1 ? tag.groups[0]
            : { ...tag.groups[0], from: [...tag.owners].join(', '), to: `${tag.groups.length} schemas`, edges: tag.groups.flatMap((g) => g.edges) });
    };
    const coveredByHover = useMemo(() => {
        if (!hoverEdge?.shared) return new Set();
        return new Set(hoverEdge.edges.map((e) => e.from).filter((name) => name !== hoverEdge.from));
    }, [hoverEdge]);
    // A row of the concept's relationship tables traces the map arrows that carry its references (a collapsed
    // group card's arrow when the other end is folded into it).
    const traceReferences = useCallback((references) => {
        const wanted = new Set((references || []).map((e) => `${e.from}.${e.field}>${e.to}`));
        const traced = shownGroups.filter((g) => g.edges.some((e) => wanted.has(`${e.from}.${e.field}>${e.to}`)));
        // In the panel view, links to other groups have no arrow; their group cards are marked instead.
        const cards = [...(panelView?.cardLinks || [])].filter(([, link]) => link.edges.some((e) => wanted.has(`${e.from}.${e.field}>${e.to}`)))
            .flatMap(([card, link]) => [card, ...link.panels]);
        setHoverEdge(traced.length || cards.length ? { key: 'concept-trace', keys: new Set(traced.map((g) => g.key)),
            ends: new Set([...cards, ...traced.flatMap((g) => [g.from, g.to, ...g.edges.flatMap((e) => [e.from, e.to])])]), edges: traced.flatMap((g) => g.edges) } : null);
    }, [shownGroups, panelView]);
    const tracedEnds = useMemo(() => new Set(hoverEdge ? hoverEdge.ends || [hoverEdge.from, hoverEdge.to] : []), [hoverEdge]);
    const drawnGroups = shownGroups;
    const showAllTypes = useCallback(() => onBrowseAll?.(), [onBrowseAll]);
    const overviewProps = { index, nodes: overviewNodes, onAllTypes: showAllTypes, onDetail, onNavigate };
    if (researchOverview) return <ResearchOverview {...overviewProps} />;
    // The selected schema's links on this map: an inheritance note, then its links by direction.
    const schemaLinks = selected && (
        <>
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
                                    <td className="se-selected-action"><button type="button" onClick={() => inspect({ ...e, edges: [e] })}>Details <i className="icon icon-fw icon-angle-right fas" aria-hidden="true" /></button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
            {!incident.length && (
                <p className="se-flow-note">{domain && !neighbors && !showExternal && externalGroups.length
                    ? 'No links inside this group. Its links go to other groups: turn on Links to other groups, or open External connections on the schema.'
                    : 'No visible links. Turn on more relationship kinds under Relationships, or show more types.'}
                </p>
            )}
        </>
    );
    const diagram = (
        <section
            className={`se-diagram${conceptContext ? ' se-concept-diagram' : ''}${full ? ' se-fullscreen' : ''}${showDomains ? ' se-hierarchical' : ''}`}
            aria-label={
                'All schema relationships'
            }>
            {/* A concept's heading and tabs are drawn by the metadata map above this diagram. */}
            {!conceptContext && (
                // Set like the concept and schema headings: a plain title over one ruled label | value row.
                <header className="se-diagram-header">
                    <div className="se-diagram-heading">
                        <h2>{title}</h2>
                        {eyebrow && (
                            <p className="se-diagram-meta">
                                <span>{eyebrow}</span>
                                <span>{headingCount} {headingCount === 1 ? 'schema' : 'schemas'}</span>
                            </p>
                        )}
                    </div>
                </header>
            )}
            <div className="se-diagram-controls">
                <div className="se-map-tool-section" role="group" aria-label="Diagram filters">
                    {(showDomains || neighborhoodView) && (
                        <label>Connections
                            <select aria-label="Connection detail" value={selected && !neighborhoodView ? 'selected' : neighborhoodView && connectionMode === 'panels' ? 'shared' : connectionMode} onChange={(event) => { setConnectionMode(event.target.value); setMoves({}); }} disabled={!!selected && !neighborhoodView}>
                                {selected && !neighborhoodView && <option value="selected">Selected type: exact links</option>}
                                {!neighborhoodView && <option value="panels">Between panels</option>}
                                <option value="shared">Shared definitions</option>
                                <option value="all">All references</option>
                            </select>
                        </label>
                    )}
                    {showDomains && domain && !neighbors && (
                        <label className="se-external-toggle"><input type="checkbox" checked={showExternal} onChange={(e) => { setShowExternal(e.target.checked); setMoves({}); }} />Links to other groups</label>
                    )}
                    <details ref={relationshipMenu}>
                        <summary>Relationships {kinds.length}/3 <i className="icon icon-angle-down fas" aria-hidden="true" /></summary>
                        <div className="se-link-filter-popover"><Filters kinds={kinds} onChange={setKinds} /></div>
                    </details>
                    <details className="se-type-picker" ref={typePicker}>
                        <summary>Types {nodes.filter((n) => !hidden.includes(n.name)).length}/{nodes.length} <i className="icon icon-angle-down fas" aria-hidden="true" /></summary>
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
                    <details className="se-map-settings" ref={mapSettings}>
                        <summary>Map settings <i className="icon icon-angle-down fas" aria-hidden="true" /></summary>
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
                </div>
                <div className="se-map-tool-section se-canvas-actions" role="group" aria-label="Canvas controls">
                    <div className="se-zoom-controls" role="group" aria-label="Zoom controls">
                        <button type="button" onClick={() => fit(false)}>Fit all</button>
                        <button type="button" aria-label="Zoom out" onClick={() => zoom(0.8)}>−</button>
                        <span>{Math.round(camera.scale * 100)}%</span>
                        <button type="button" aria-label="Zoom in" onClick={() => zoom(1.25)}>+</button>
                    </div>
                    <button type="button" onClick={() => { setMoves({}); fit(); }}>Reset layout</button>
                    <button type="button" id="entity-export" disabled={exporting} onClick={async () => {
                        setExporting(true);
                        try { await exportPNG(svg.current, 'schema-map'); }
                        catch (err) { setError(err.message || 'PNG export failed.'); }
                        finally { setExporting(false); }
                    }}>{exporting ? 'Exporting…' : 'Export PNG'}
                    </button>
                </div>
            </div>
            {error && <p role="alert">{error}</p>}
            {openedPanel && (
                <div className="se-selection-bar" role="status" aria-label="Opened arrow">
                    <strong>{endLabel(openedPanel.from)} → {endLabel(openedPanel.to)}</strong>
                    <span className="se-selection-meta">{openedPanel.edges.length} {openedPanel.edges.length === 1 ? 'link' : 'links'} · select one for its details</span>
                    <span className="se-selection-actions">
                        <button type="button" onClick={() => inspect(openedPanel)}>All fields</button>
                        <button type="button" className="se-selection-clear" onClick={() => setOpenedArrow(null)}><i className="icon icon-fw icon-times fas" aria-hidden="true" /> Show all arrows</button>
                    </span>
                </div>
            )}
            {selected && (
                <div className="se-selection-bar" role="status" aria-label="Selected schema">
                    <strong>{selected}</strong>
                    <span className="se-selection-meta">{incident.length} {incident.length === 1 ? 'link' : 'links'} highlighted</span>
                    <span className="se-selection-actions">
                        <button type="button" id="entity-show-neighborhood" aria-pressed={neighbors} onClick={() => {
                            if (!neighbors) showConnected();
                            else { setMoves({}); setNeighbors(false); }
                        }}>{neighbors ? 'Back to the whole group' : 'Show only its connections'}
                        </button>
                        <button type="button" onClick={() => svg.current?.closest('.se-diagram')?.querySelector('#entity-details')?.scrollIntoView({ block: 'start', behavior: 'smooth' })}>
                            Go to details <i className="icon icon-fw icon-angle-down fas" aria-hidden="true" />
                        </button>
                        <button type="button" className="se-selection-clear" onClick={clearSelection} aria-label={`Clear selection of ${selected}`}><i className="icon icon-fw icon-times fas" aria-hidden="true" /> Clear</button>
                    </span>
                </div>
            )}
            <div className="se-canvas-wrap">
                {/* The reading note and legend sit behind an info icon, as on the portal's charts. */}
                <span className="se-canvas-info">
                    <InfoPopover id="se-diagram-guide-popover" className="se-diagram-guide-popover" label="How to read this diagram" title="Reading the diagram" placement="bottom-end">
                        {guideNote && <p>{guideNote}</p>}
                        {legend.length > 0 && (
                            <ul className="se-diagram-legend" aria-label="Diagram legend">
                                {legend.map(([kind, label]) => <li key={kind}><span className={`se-legend-swatch se-legend-${kind}`} aria-hidden="true" />{label}</li>)}
                            </ul>
                        )}
                    </InfoPopover>
                </span>
                <button type="button" className="se-canvas-fullscreen" id="entity-fullscreen" aria-label={full ? 'Exit full screen' : 'Enter full screen'} title={full ? 'Exit full screen' : 'Enter full screen'} aria-pressed={full} onPointerDown={(e) => e.stopPropagation()} onClick={() => setFull(!full)}>
                    <i className={`icon icon-fw fas ${full ? 'icon-compress-alt' : 'icon-expand-alt'}`} aria-hidden="true" />
                </button>
                <svg
                    ref={svg}
                    id="entity-svg"
                    className="se-canvas"
                    style={canvasHeight ? { height: canvasHeight, minHeight: 0 } : undefined}
                    tabIndex={0}
                    role="group"
                    aria-label="Schema relationship diagram"
                    onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        // Capturing on the SVG retargets clicks away from edges.
                        // Leave relationship controls to their own click handlers.
                        if (e.target.closest('.se-edge, .se-edge-label, .se-panel-edge-chip, [data-external-group]')) return;
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
                        cameraTouched.current = true;
                        d.x = e.clientX;
                        d.y = e.clientY;
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
                        // A click on the empty canvas closes an opened arrow.
                        if (d && !d.moved && !d.name) setOpenedArrow(null);
                        if (e.currentTarget.hasPointerCapture(e.pointerId))
                            e.currentTarget.releasePointerCapture(e.pointerId);
                    }}
                    onPointerCancel={() => {
                        drag.current = null;
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape' && openedArrow) { setOpenedArrow(null); return; }
                        if (e.target !== e.currentTarget) return;
                        const delta = {
                            ArrowLeft: [50, 0],
                            ArrowRight: [-50, 0],
                            ArrowUp: [0, 50],
                            ArrowDown: [0, -50],
                        }[e.key];
                        if (delta) {
                            e.preventDefault();
                            cameraTouched.current = true;
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
                        className={`${hoverEdge ? 'se-tracing-inheritance' : ''}${openedPanel && !hoverState ? ' se-opened-arrow' : ''}` || undefined}
                        transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
                        {showDomains && clustered.frames.map((frame) => (
                            <g key={frame.id} className="se-domain-frame">
                                <rect x={frame.left} y={frame.top} width={frame.width} height={frame.height} rx="4" />
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
                        {showDomains && clustered.layers.map((layer) => (
                            <rect key={`panel-${layer.id}`} className={`se-stage-panel${conceptContext && layer.concept === conceptContext.id ? ' se-stage-current' : ''}${tracedEnds.has(layer.id) ? ' se-stage-traced' : ''}`} x={layer.panel.left} y={layer.panel.top} width={layer.panel.width} height={layer.panel.height} rx="4" />
                        ))}
                        {showDomains && clustered.layers.map((layer) => (
                            <g key={layer.id}>
                                <circle cx={layer.left + 3} cy={layer.top + 12} r="3" fill={stageAccent(layer.id.slice(layer.domain.length + 1))} aria-hidden="true" />
                                <text className="se-stage-label" x={layer.left + 12} y={layer.top + 18}>
                                    {layer.label}
                                    {/* Links between schemas of one panel draw no arrow in the panel view; they are counted here. */}
                                    {panelView?.inside.get(layer.id) > 0 && <tspan className="se-stage-inside" dx="10">{panelView.inside.get(layer.id)} {panelView.inside.get(layer.id) === 1 ? 'link' : 'links'} inside</tspan>}
                                </text>
                            </g>
                        ))}
                        {neighborhoodView?.panels.map((panel) => (
                            <rect key={`panel-${panel.id}`} className="se-stage-panel" x={panel.panel.left} y={panel.panel.top} width={panel.panel.width} height={panel.panel.height} rx="4" />
                        ))}
                        {neighborhoodView?.panels.map((panel) => (
                            <text key={panel.id} className="se-stage-label se-neighborhood-group" x={panel.left} y={panel.top + 18}>{panel.label}</text>
                        ))}
                        {drawnGroups.map((g) => {
                            if (routed && !routes[g.key]) return null;
                            const displayKind = g.reverse && kinds.includes('reverse') &&
                                !kinds.includes(g.kind) ? 'reverse' : g.kind;
                            const a = (g.panel ? panelView.anchors : positions)[g.from],
                                b = (g.panel ? panelView.anchors : positions)[g.to],
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
                                        className={`se-edge ${displayKind}${g.panel ? ' se-panel-edge' : ''}${g.opened ? ' se-opened-edge' : ''}${hoverEdge?.key === g.key || hoverEdge?.keys?.has(g.key) ? ' se-traced-edge' : ''}`}
                                        d={routed ? routes[g.key].d : d}
                                        markerEnd={`url(#${markerPrefix}-${displayKind})`}
                                        tabIndex={0}
                                        role="button"
                                        aria-label={g.panel ? `${endLabel(g.from)} to ${endLabel(g.to)}: ${edgeCaption(g)}` : `${g.from} to ${g.to}`}
                                        onClick={() => activate(g)}
                                        onMouseEnter={() => setHoverEdge(g.panel ? panelTrace(g) : g)} onMouseLeave={() => setHoverEdge(null)}
                                        onFocus={() => setHoverEdge(g.panel ? panelTrace(g) : g)} onBlur={() => setHoverEdge(null)}
                                        onKeyDown={(e) => {
                                            if (
                                                e.key === 'Enter' ||
                                            e.key === ' '
                                            ) {
                                                e.preventDefault();
                                                activate(g);
                                            }
                                        }}>
                                        <title>{edgeTooltip(g)}</title>
                                    </path>
                                    {g.panel || g.opened ? null : neighborhoodView ? neighborhoodLabels[g.key] && (
                                        <text className="se-edge-label" x={neighborhoodLabels[g.key].left + neighborhoodLabels[g.key].width / 2}
                                            y={neighborhoodLabels[g.key].top + 15} onClick={() => inspect(g)}>
                                            {edgeCaption(g)}
                                        </text>
                                    ) : (neighbors ||
                                    (!showDomains && visible.length <= 12)) && (
                                        <text
                                            className="se-edge-label"
                                            x={same ? a.x : cx}
                                            y={same ? ay - 80 : cy - 8}
                                            onClick={() => inspect(g)}>
                                            {edgeCaption(g)}
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
                            const extra = bundle.unmapped && bundle.mapLabels.length ? ` +${bundle.unmapped} other` : '';
                            const mapLine = bundle.mapLabels.length ? `Map: ${bundle.mapLabels.join(', ')}${extra}` : 'Not on the Donor to data map';
                            // About 36 characters of 11px text fit in the card; the full line stays in the tooltip.
                            const mapText = mapLine.length > 36 ? `${mapLine.slice(0, 35)}…` : mapLine;
                            const cardLink = panelView?.cardLinks.get(bundle.name);
                            const traceCard = cardLink ? { onMouseEnter: () => setHoverEdge({ key: `card:${bundle.name}`, keys: new Set(), edges: cardLink.edges,
                                ends: new Set([bundle.name, ...cardLink.panels, ...cardLink.edges.flatMap((e) => [e.from, e.to])]) }), onMouseLeave: () => setHoverEdge(null) } : {};
                            return (
                                <g key={bundle.name} data-external-group={bundle.id} {...traceCard} className={`se-external-group-card${tracedEnds.has(bundle.name) ? ' se-traced-group' : ''}`}
                                    transform={`translate(${p.x - width / 2},${p.y - height / 2})`} role="button" tabIndex={0}
                                    aria-label={`${expanded ? 'Collapse' : 'Expand'} ${bundle.label}: ${bundle.members.length} connected schemas`} aria-expanded={expanded}
                                    onClick={toggle} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); } }}>
                                    <title>{`${bundle.label}\n${mapLine}`}</title><rect width={width} height={height} rx="4" />
                                    <text x="12" y="20" className="se-external-group-title">{label}</text>
                                    <text x="12" y="37" className="se-external-group-map">{mapText}</text>
                                    <text x="12" y="54">
                                        {/* In the panel view this card stands for its arrows, so it counts the links it carries. */}
                                        {cardLink ? `${cardLink.count} ${cardLink.count === 1 ? 'link' : 'links'} · ${bundle.members.length} ${bundle.members.length === 1 ? 'schema' : 'schemas'}`
                                            : `${bundle.members.length} connected ${bundle.members.length === 1 ? 'schema' : 'schemas'}`} · {expanded ? 'Collapse ↑' : 'Expand →'}
                                    </text>
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
                            // A schema of another group drawn on its own card stands for its panel arrows, like a group card.
                            const cardLink = panelView?.cardLinks.get(n.name);
                            const traceCard = cardLink ? { onMouseEnter: () => setHoverEdge({ key: `card:${n.name}`, keys: new Set(), edges: cardLink.edges,
                                ends: new Set([n.name, ...cardLink.panels, ...cardLink.edges.flatMap((e) => [e.from, e.to])]) }), onMouseLeave: () => setHoverEdge(null) } : {};
                            return (
                                <g
                                    {...traceCard}
                                    key={n.name}
                                    data-entity={n.name}
                                    className={`entity-node${coveredByHover.has(n.name) ? ' se-covered' : ''}${tracedEnds.has(n.name) ? ' se-covered-owner' : ''}${conceptContext && conceptMembers.has(n.name) ? ' se-concept-center' : ''}${presentation.isAbstract ? ' se-node-abstract' : ''} ${
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
                                    {externalContextNames.has(n.name) && (() => {
                                        // One line over the card, no wider than it: a long group name is shortened, never the count.
                                        const group = domains.find((d) => d.id === domainFor(n.name))?.label || '';
                                        const count = cardLink ? ` · ${cardLink.count} ${cardLink.count === 1 ? 'link' : 'links'}` : '';
                                        const room = 40 - 'Other group · '.length - count.length;
                                        return (
                                            <text className="se-context-domain" x="0" y="-8">
                                                Other group · {group.length > room ? `${group.slice(0, room - 1).trimEnd()}…` : group}{count}
                                            </text>
                                        );
                                    })()}
                                    <rect className="se-node-body" width={cardWidth} height={cardHeight} rx={4} />
                                    <text className="se-node-title" x="12" y={26}>
                                        {n.name}
                                    </text>
                                    <text x="12" y="49" className="se-subtitle">
                                        {presentation.caption}
                                    </text>
                                    {coveredByHover.has(n.name) && (
                                        <g aria-hidden="true">
                                            <rect className="se-covered-badge" x={cardWidth - 66} y="9" width="56" height="16" rx="4" />
                                            <text className="se-covered-label" x={cardWidth - 38} y="20">Inherits</text>
                                        </g>
                                    )}
                                    {presentation.isAbstract && (
                                        <g aria-hidden="true">
                                            <rect className="se-node-abstract-badge" x={cardWidth - 65} y="9" width="54" height="16" rx="4" />
                                            <text className="se-node-abstract-label" x={cardWidth - 38} y="20">Abstract</text>
                                        </g>
                                    )}
                                    {inheritedTags.has(n.name) && (() => {
                                        const tag = inheritedTags.get(n.name), count = tag.edges.length;
                                        const text = `↑ ${count} ${count === 1 ? 'link' : 'links'} via ${[...tag.owners].join(', ')}`;
                                        const tagWidth = Math.min(cardWidth - 16, text.length * 5.6 + 16);
                                        const trace = () => setHoverEdge(traceInherited(n.name));
                                        return (
                                            // Sits on the card's bottom edge, inside the gap every stage leaves below its cards.
                                            <g className="se-inherited-tag" role="button" tabIndex={0}
                                                aria-label={`${n.name}: ${count} inherited ${count === 1 ? 'link' : 'links'} drawn at ${[...tag.owners].join(', ')}`}
                                                onPointerDown={(event) => event.stopPropagation()}
                                                onMouseEnter={trace} onMouseLeave={() => setHoverEdge(null)} onFocus={trace} onBlur={() => setHoverEdge(null)}
                                                onClick={(event) => { event.stopPropagation(); inspectInherited(n.name); }}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); inspectInherited(n.name); }
                                                }}>
                                                <title>{`Inherited from ${[...tag.owners].join(', ')}. Its shared definition is drawn once at the base; hover to trace it.`}</title>
                                                <rect x={(cardWidth - tagWidth) / 2} y={cardHeight - 8} width={tagWidth} height="16" rx="3" />
                                                <text x={cardWidth / 2} y={cardHeight + 3.5}>{text}</text>
                                            </g>
                                        );
                                    })()}
                                </g>
                            );
                        })}
                        {/* Panel arrow labels sit above the cards, so a label wider than its gap is never hidden under one. */}
                        {panelView && shownGroups.filter((g) => (g.panel || g.opened) && panelLabels[g.key]).map((g) => {
                            const chip = panelLabels[g.key];
                            const traced = hoverEdge?.key === g.key || hoverEdge?.keys?.has(g.key);
                            return (
                                <g key={`chip:${g.key}`} className={`se-panel-edge-chip${traced ? ' se-traced-chip' : ''}`}
                                    onClick={() => activate(g)}
                                    onMouseEnter={() => setHoverEdge(g.panel ? panelTrace(g) : g)} onMouseLeave={() => setHoverEdge(null)}>
                                    <title>{edgeTooltip(g)}</title>
                                    <rect x={chip.x - chip.width / 2} y={chip.y - 9} width={chip.width} height="18" rx="3" />
                                    <text x={chip.x} y={chip.y + 4}>{chip.text}</text>
                                </g>
                            );
                        })}
                        {/* With links to other groups drawn, the external cards already show this; the cue would only repeat it. */}
                        {domain && !neighbors && !showExternal && selected && positions[selected] && externalGroups.length > 0 && (
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
                                    <rect x="-105" y="7" width="210" height="19" rx="3" />
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
                {domain && !neighbors && !showExternal && outsideOpen && externalGroups.length > 0 && (
                    <div className="se-cross-group-popover" style={{ left: outsideLeft, top: outsideTop, width: outsideWidth, maxHeight: outsideHeight }}
                        onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeOutside(); } }}>
                        <CrossGroupConnections key={selected} selected={selected} groups={externalGroups} sectionRef={outsidePanel}
                            onChoose={choose} onInspect={inspect} onShowAll={showConnected} onClose={closeOutside} />
                    </div>
                )}
            </div>
            {selected ? (
                <section id="entity-details" className="se-selected-panel" aria-label={`${selected} details`}>
                    {renderSchema ? renderSchema(selected, schemaLinks) : schemaLinks}
                </section>
            ) : conceptContext && (
                <ConceptSummary concept={conceptContext} connections={conceptContext.connections} graph={conceptGraph} index={index}
                    onDetail={onDetail} onTrace={traceReferences} />
            )}
        </section>
    );
    // A concept's Summary and Map tabs share its heading; the Map tab's content is this diagram.
    if (conceptContext) {
        return <ResearchOverview {...overviewProps} conceptId={conceptContext.id} mapTab={diagram} />;
    }
    return diagram;
}
