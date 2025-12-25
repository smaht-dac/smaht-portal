import React from 'react';
import PropTypes from 'prop-types';
import { OverlayTrigger } from 'react-bootstrap';

// --- Responsive width hook (copied from DonorCohortViewChart) ---
function useParentWidth(ref) {
    const [w, setW] = React.useState(0);
    React.useEffect(() => {
        if (!ref.current) return;
        const ro = new ResizeObserver(([entry]) => {
            const cw = entry.contentBoxSize
                ? entry.contentBoxSize[0]?.inlineSize ?? entry.contentRect.width
                : entry.contentRect.width;
            setW(Math.max(1, Math.floor(cw)));
        });
        ro.observe(ref.current);
        return () => ro.disconnect();
    }, [ref]);
    return w;
}

/**
 * Circular progress visualization for donor sequencing completion.
 */
export function DonorSequencingProgressChart(props) {
    const {
        complete = 0,
        target = 1,
        title = 'Donor Sequencing Progress',
        loading = false,
        popover = null,
        chartHeight = 420
    } = props;

    const outerRef = React.useRef(null);
    const measuredWidth = useParentWidth(outerRef);
    const size = React.useMemo(() => {
        const availableW = measuredWidth ? measuredWidth - 32 : 0; // padding for border radius + title
        const target = Math.min(Math.max(260, availableW || chartHeight), 420);
        return Number.isFinite(target) && target > 0 ? target : 320;
    }, [measuredWidth, chartHeight]);

    const safeTarget = Math.max(target || 1, 1);
    const clampedComplete = Math.max(0, Math.min(complete, safeTarget));
    const progressRatio = clampedComplete / safeTarget;

    const center = size / 2;
    const radius = Math.max(85, Math.min(size * 0.3, 130));
    const strokeWidth = Math.max(14, Math.min(size * 0.06, 22));
    const circumference = 2 * Math.PI * radius;

    const dashOffset = circumference * (1 - progressRatio);

    const steps = 6;
    const tickValues = React.useMemo(
        () => Array.from({ length: steps + 1 }, (_, idx) => Math.round((safeTarget / steps) * idx)),
        [safeTarget]
    );

    const polarToCartesian = (value, r = radius) => {
        const angle = (value / safeTarget) * 360 - 90;
        const radians = (Math.PI / 180) * angle;
        return {
            x: center + r * Math.cos(radians),
            y: center + r * Math.sin(radians)
        };
    };

    const labelOffset = (value) => {
        if (value === 0) return { dx: 12, dy: -6 };
        if (value === safeTarget) return { dx: -12, dy: -6 };
        return { dx: 0, dy: 0 };
    };

    const markerPos = polarToCartesian(clampedComplete);

    const ringOffsetY = 16;

    return (
        <div ref={outerRef} className="donor-cohort-view-chart donor-sequencing-progress" style={{ height: chartHeight }}>
            <div className="dsp-body">
                {loading ? (
                    <div className="dsp-loading">
                        <i className="icon icon-circle-notch icon-spin fas" aria-hidden />
                    </div>
                ) : null}
                <svg
                    className="dsp-ring"
                    viewBox={`0 0 ${size} ${size}`}
                    role="img"
                    aria-label={`${clampedComplete} of ${safeTarget} donors complete`}
                    preserveAspectRatio="xMidYMid meet"
                    width={size}
                    height={size}
                >
                    <defs>
                        <linearGradient id="dsp-progress-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#14B3BB" />
                            <stop offset="100%" stopColor="#1FC8D3" />
                        </linearGradient>
                    </defs>
                    <rect
                        x="10"
                        y="10"
                        width={size - 20}
                        height={size - 20}
                        rx="14"
                        fill="#FFFFFF"
                        stroke="#A3C4ED"
                    />
                    <g transform={`translate(0, ${ringOffsetY})`}>
                        <circle
                            cx={center}
                            cy={center}
                            r={radius}
                            fill="none"
                            stroke="#F4F7FB"
                            strokeWidth={strokeWidth}
                        />
                        <circle
                            className="dsp-progress-track"
                            cx={center}
                            cy={center}
                            r={radius}
                            fill="none"
                            stroke="#E4EAF5"
                            strokeWidth={strokeWidth}
                            strokeDasharray={circumference}
                            strokeLinecap="round"
                        />
                        <circle
                            className="dsp-progress-arc"
                            cx={center}
                            cy={center}
                            r={radius}
                            fill="none"
                            stroke="url(#dsp-progress-gradient)"
                            strokeWidth={strokeWidth}
                            strokeDasharray={circumference}
                            strokeDashoffset={dashOffset}
                            strokeLinecap="round"
                            transform={`rotate(-90 ${center} ${center})`}
                        />
                        {tickValues.map((val) => {
                            const start = polarToCartesian(val, radius + 10);
                            const end = polarToCartesian(val, radius - 10);
                            return (
                                <line
                                    key={`tick-${val}`}
                                    x1={start.x}
                                    y1={start.y}
                                    x2={end.x}
                                    y2={end.y}
                                    stroke={val === 0 || val === safeTarget ? '#7D8FB0' : '#C8D3E5'}
                                    strokeWidth={val === 0 || val === safeTarget ? 2.2 : 1.8}
                                    opacity={1}
                                />
                            );
                        })}
                        {tickValues.map((val) => {
                            const pos = polarToCartesian(val, radius + 26);
                            const { dx, dy } = labelOffset(val);
                            return (
                                <text
                                    key={`label-${val}`}
                                    x={pos.x + dx}
                                    y={pos.y + dy}
                                    className={`dsp-tick-label${val === 0 || val === safeTarget ? ' dsp-tick-label-strong' : ''}`}
                                >
                                    {val}
                                </text>
                            );
                        })}
                        <g className="dsp-marker" transform={`translate(${markerPos.x}, ${markerPos.y})`}>
                            <circle r="14" fill="#FFFFFF" stroke="#D4E3F7" strokeWidth="2" />
                            <circle r="6" fill="#14B3BB" />
                        </g>
                    </g>
                </svg>
                <div className="dsp-center">
                    <div className="dsp-count">
                        <span className="dsp-count-current">{clampedComplete}</span>
                        <span className="dsp-count-target">/{safeTarget}</span>
                    </div>
                    <div className="dsp-subtitle">Donors Complete</div>
                </div>
            </div>

            <div className="chart-title-container">
                <h3>
                    {title}
                    {popover && (
                        <OverlayTrigger
                            flip
                            placement="auto"
                            rootClose
                            rootCloseEvent="click"
                            overlay={popover}
                        >
                            <button type="button" className="info-tooltip" aria-label="More info">
                                <i className="icon icon-info-circle fas" />
                            </button>
                        </OverlayTrigger>
                    )}
                </h3>
            </div>
        </div>
    );
}

DonorSequencingProgressChart.propTypes = {
    complete: PropTypes.number,
    target: PropTypes.number,
    title: PropTypes.string,
    loading: PropTypes.bool,
    popover: PropTypes.element,
    chartHeight: PropTypes.oneOfType([PropTypes.number, PropTypes.string])
};

export default DonorSequencingProgressChart;
