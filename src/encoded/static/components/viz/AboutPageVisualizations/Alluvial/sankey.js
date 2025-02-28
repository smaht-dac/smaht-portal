import * as d3 from 'd3';

/**
 * @description High level function that returns a sankey object with
 * many methods. Added to the global d3 object.
 * @returns {Object} Sankey object
 */
export function sankeyFunc() {
    let sankey = {},
        nodeWidth = 24, // Default width of node blocks
        nodePadding = 8, // Default padding between nodes
        size = [1, 1], // Default dimensions of svg
        nodes = [], // Default list of node objects
        links = []; // Default list of link objects

    /**
     * @description Setter function for the width of each node block in pixels
     * @method nodeWidth
     * @param {Number} _ width of nodes in pixels
     * @returns {Object} Sankey object
     */
    sankey.nodeWidth = function (_) {
        if (!arguments.length) return nodeWidth;
        nodeWidth = +_;
        return sankey;
    };

    // Setter function for padding between nodes
    sankey.nodePadding = function (_) {
        if (!arguments.length) return nodePadding;
        nodePadding = +_;
        return sankey;
    };

    /**
     * Setter function for list of nodes
     * @method nodes method for setting the list of nodes in a sankey plot
     * @param {Array} _ array of nodes
     * @returns {Object} Sankey object
     */
    sankey.nodes = function (_) {
        if (!arguments.length) return nodes;
        nodes = _;
        return sankey;
    };

    /**
     * Setter function for list of links
     * @method links a method for setting the list of links in a sankey plot
     * @param {Array} _ array of links
     * @returns {Object} Sankey object
     */
    sankey.links = function (_) {
        if (!arguments.length) return links;
        links = _;
        return sankey;
    };

    /**
     * Setter method for the size of the resulting sankey plot
     * @method size a method for setting the size of the resulting svg
     * @param {Array} _ array in the form of [{width}, {height}]
     * @returns {Object} Sankey object
     */
    sankey.size = function (_) {
        if (!arguments.length) return size;
        size = _;
        return sankey;
    };

    /**
     *
     * @method layout
     * @param {Number} iterations number of iterations to compute the values
     * @returns {Object} Sankey object
     */
    sankey.layout = function (iterations) {
        computeNodeLinks();
        computeNodeValues();
        computeNodeBreadths();
        computeNodeDepths(iterations);
        computeLinkDepths();
        return sankey;
    };

    sankey.relayout = function () {
        computeLinkDepths();
        return sankey;
    };

    sankey.link = function () {
        var curvature = 0.4;

        function link(d) {
            var x0 = d.source.x + d.source.dx,
                x1 = d.target.x,
                xi = d3.interpolateNumber(x0, x1),
                x2 = xi(curvature),
                x3 = xi(1 - curvature),
                y0 = d.source.y + d.sy + d.dy / 2,
                y1 = d.target.y + d.ty + d.dy / 2;
            return (
                'M' +
                x0 +
                ',' +
                y0 +
                'C' +
                x2 +
                ',' +
                y0 +
                ' ' +
                x3 +
                ',' +
                y1 +
                ' ' +
                x1 +
                ',' +
                y1
            );
        }

        link.curvature = function (_) {
            if (!arguments.length) return curvature;
            curvature = +_;
            return link;
        };

        return link;
    };

    // Populate the sourceLinks and targetLinks for each node.
    // Also, if the source and target are not objects, assume they are indices.
    function computeNodeLinks() {
        nodes.forEach(function (node) {
            node.sourceLinks = [];
            node.targetLinks = [];
        });
        links.forEach(function (link) {
            var { source } = link,
                { target } = link;
            if (typeof source === 'number')
                source = link.source = nodes[link.source];
            if (typeof target === 'number')
                target = link.target = nodes[link.target];
            source.sourceLinks.push(link);
            target.targetLinks.push(link);
        });
    }

    // Compute the value (size) of each node by summing the associated links.
    function computeNodeValues() {
        nodes.forEach(function (node) {
            node.value = Math.max(
                d3.sum(node.sourceLinks, value),
                d3.sum(node.targetLinks, value)
            );
        });
    }

    // Iteratively assign the breadth (x-position) for each node.
    // Nodes are assigned the maximum breadth of incoming neighbors plus one;
    // nodes with no incoming links are assigned breadth zero, while
    // nodes with no outgoing links are assigned the maximum breadth.
    function computeNodeBreadths() {
        var remainingNodes = nodes,
            nextNodes,
            x = 0;

        while (remainingNodes.length) {
            nextNodes = [];
            remainingNodes.forEach(function (node) {
                node.x = x;
                node.dx = nodeWidth;
                node.sourceLinks.forEach(function (link) {
                    if (nextNodes.indexOf(link.target) < 0) {
                        nextNodes.push(link.target);
                    }
                });
            });
            remainingNodes = nextNodes;
            ++x;
        }
        moveSinksRight(x);
        scaleNodeBreadths((size[0] - nodeWidth) / (x - 1));
    }

    function moveSourcesRight() {
        nodes.forEach(function (node) {
            if (!node.targetLinks.length) {
                node.x =
                    d3.min(node.sourceLinks, function (d) {
                        return d.target.x;
                    }) - 1;
            }
        });
    }

    function moveSinksRight(x) {
        nodes.forEach(function (node) {
            if (!node.sourceLinks.length) {
                node.x = x - 1;
            }
        });
    }

    function scaleNodeBreadths(kx) {
        nodes.forEach(function (node) {
            node.x *= kx;
        });
    }

    function computeNodeDepths(iterations) {
        var nodesByBreadth = d3
            .groups(nodes, (d) => d.x)
            .sort((a, b) => {
                return d3.ascending(a[0], b[0]);
            })
            .map(function (d) {
                return d[1];
            });

        initializeNodeDepth();
        resolveCollisions();
        for (var alpha = 1; iterations > 0; --iterations) {
            relaxRightToLeft((alpha *= 0.99));
            resolveCollisions();
            relaxLeftToRight(alpha);
            resolveCollisions();
        }

        function initializeNodeDepth() {
            var ky = d3.min(nodesByBreadth, function (nodes) {
                return (
                    (size[1] - (nodes.length - 1) * nodePadding) /
                    d3.sum(nodes, value)
                );
            });

            nodesByBreadth.forEach(function (nodes) {
                nodes.forEach(function (node, i) {
                    node.y = i;
                    if (node.type === 'data_generator') {
                        node.dy =
                            (size[1] - (nodes.length - 1) * nodePadding) /
                            nodes.length;
                    } else {
                        node.dy = node.value * ky;
                    }
                });
            });

            links.forEach(function (link) {
                link.dy = link.value * ky;
            });
        }

        function relaxLeftToRight(alpha) {
            nodesByBreadth.forEach(function (nodes, breadth) {
                nodes.forEach(function (node) {
                    if (node.targetLinks.length) {
                        var y =
                            d3.sum(node.targetLinks, weightedSource) /
                            d3.sum(node.targetLinks, value);
                        node.y += (y - center(node)) * alpha;
                    }
                });
            });

            function weightedSource(link) {
                return center(link.source) * link.value;
            }
        }

        function relaxRightToLeft(alpha) {
            nodesByBreadth
                .slice()
                .reverse()
                .forEach(function (nodes) {
                    nodes.forEach(function (node) {
                        if (node.sourceLinks.length) {
                            var y =
                                d3.sum(node.sourceLinks, weightedTarget) /
                                d3.sum(node.sourceLinks, value);
                            node.y += (y - center(node)) * alpha;
                        }
                    });
                });

            function weightedTarget(link) {
                return center(link.target) * link.value;
            }
        }

        function resolveCollisions() {
            nodesByBreadth.forEach(function (nodes) {
                let node,
                    dy,
                    y0 = 0,
                    n = nodes.length,
                    i;

                // Push any overlapping nodes down.
                // Sort data_generator type nodes alphabetically
                let sortFn;
                switch (nodes[0].type) {
                    case 'data_generator':
                        sortFn = alphabetical;
                        break;
                    case 'sequencing_platform':
                        sortFn = descendingDepth;
                        break;
                    case 'assay_type':
                        sortFn = descendingDepthCategorical;
                        break;
                    case 'molecular_feature':
                        sortFn = categorical;
                        break;
                    default:
                        break;
                }
                nodes.sort(sortFn);
                for (i = 0; i < n; ++i) {
                    node = nodes[i];
                    dy = y0 - node.y;
                    if (dy > 0) node.y += dy;
                    y0 = node.y + node.dy + nodePadding;
                }

                // If the bottommost node goes outside the bounds, push it back up.
                dy = y0 - nodePadding - size[1];
                if (dy > 0) {
                    y0 = node.y -= dy;

                    // Push any overlapping nodes back up.
                    for (i = n - 2; i >= 0; --i) {
                        node = nodes[i];
                        dy = node.y + node.dy + nodePadding - y0;
                        if (dy > 0) node.y -= dy;
                        y0 = node.y;
                    }
                }
            });
        }

        function alphabetical(a, b) {
            console.log(a, b);
            if (a?.data_generator_category === b?.data_generator_category) {
                return a.name.localeCompare(b.name);
            }
            if (b?.data_generator_category === 'GCC') return 1;
            return a?.name?.localeCompare(b?.name);
        }

        function categorical(a, b) {
            if (a?.category && b?.category && a.type === b.type) {
                if (b.category === 'genetic') return 1; // force genetic as top
                return a.category.localeCompare(b.category);
            }
        }

        function descendingDepth(a, b) {
            return b.dy - a.dy;
        }

        function descendingDepthCategorical(a, b) {
            if (b.dy - a.dy === 0 && b.type === 'assay_type') {
            }
            let a_group = a.assay_group.split('-');
            let b_group = b.assay_group.split('-');

            return a_group[0] - b_group[0] || a_group[1] - b_group[1];
        }
    }

    function computeLinkDepths() {
        nodes.forEach(function (node) {
            node.sourceLinks.sort(ascendingTargetDepth);
            node.targetLinks.sort(ascendingSourceDepth);
        });
        nodes.forEach(function (node) {
            var sy = 0,
                ty = 0;
            node.sourceLinks.forEach(function (link) {
                link.sy = sy;
                sy += link.dy / 2;
            });
            node.targetLinks.forEach(function (link) {
                link.ty = ty;
                ty += link.dy;
            });
        });

        function ascendingSourceDepth(a, b) {
            return a.source.y - b.source.y;
        }

        function ascendingTargetDepth(a, b) {
            return a.target.y - b.target.y;
        }
    }

    function center(node) {
        return node.y + node.dy / 2;
    }

    function value(link) {
        return link.value;
    }

    return sankey;
}
