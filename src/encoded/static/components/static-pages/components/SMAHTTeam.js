import React from "react";
import { Container, Row, Col, Card } from "react-bootstrap";

/** Borderless, circular avatar card with fixed width.
 *  Grayscale -> color on hover. Falls back to Font Awesome icon if no img.
 *  If profileUrl is provided, the person's name becomes a link (new tab).
 */
const PersonCard = ({ name, title, org, imgUrl, profileUrl }) => {
    const hasImg = Boolean(imgUrl);
    return (
        <Card className="border-0 text-center bg-transparent person-card">
            <div className="person-avatar-wrap rounded-circle">
                {hasImg ? (
                    <img src={imgUrl} alt={name} className="person-avatar" loading="lazy" />
                ) : (
                    <div className="placeholder-avatar rounded-circle d-flex align-items-center justify-content-center">
                        <i className="icon icon-fw icon-user icon-3x placeholder-icon" aria-hidden="true" />
                    </div>
                )}
            </div>
            <Card.Body className="px-0">
                <Card.Title className="fs-4 fw-semibold mb-1 name">
                    {profileUrl ? (
                        <a
                            href={profileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="person-name-link"
                            aria-label={`${name} (opens in new tab)`}
                        >
                            {name}
                        </a>
                    ) : (
                        name
                    )}
                </Card.Title>
                {title && <div className="lh-sm wrap person-title">{title}</div>}
                {/* {org && <div className="text-muted-50 wrap">{org}</div>} */}
            </Card.Body>
        </Card>
    );
};


/** Fancy subgroup header: blue lines + rotated icon + bold text */
const SubHeader = ({ children }) => (
    <div className="fancy-heading" role="heading" aria-level={3}>
        <span className="fancy-line" aria-hidden="true" />
        <span className="fancy-center">
            {/* <i className="fa-solid fa-dna dna-icon" aria-hidden="true" /> */}
            <img className="smaht-logo" src="/static/img/SMaHT_Vertical-Logo-Solo_FV.png" height="50"></img>
            <span className="fancy-text">{children}</span>
        </span>
        <span className="fancy-line" aria-hidden="true" />
    </div>
);


/** Generic subgroup with fixed-width cards
 *  layout="3-2" keeps a 3 + 2 centered arrangement for 5 people.
 */
const Subgroup = ({ title, people, layout }) => {
    if (layout === "3-2" && people.length === 5) {
        const firstRow = people.slice(0, 3);
        const secondRow = people.slice(3);

        return (
            <div className="mb-8">
                {title ? <SubHeader>{title}</SubHeader> : null}

                <Row className="g-4 justify-content-center">
                    {firstRow.map((p, i) => (
                        <Col key={`r1-${i}`} xs="auto" className="d-flex justify-content-center">
                            <PersonCard {...p} />
                        </Col>
                    ))}
                </Row>

                <Row className="g-4 justify-content-center mt-1">
                    {secondRow.map((p, i) => (
                        <Col key={`r2-${i}`} xs="auto" className="d-flex justify-content-center">
                            <PersonCard {...p} />
                        </Col>
                    ))}
                </Row>
            </div>
        );
    }

    // Default: just render all with auto cols (cards have fixed width)
    return (
        <div className="mb-8">
            {title ? <SubHeader>{title}</SubHeader> : null}
            <Row className="g-4 justify-content-center">
                {people.map((p, idx) => (
                    <Col key={idx} xs="auto" className="d-flex justify-content-center">
                        <PersonCard {...p} />
                    </Col>
                ))}
            </Row>
        </div>
    );
};

/** Big centered section with bold title */
const Section = ({ title, subtitle, children, showLogo }) => (
    <section className="py-2 text-center">
        {showLogo && (
            <img className="hms-logo mb-3" src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Harvard_Medical_School.svg/340px-Harvard_Medical_School.svg.png?20240522214811" height="80" />
        )}
        <h2 className="team-section-title">{title}</h2>
        {subtitle && <p className="lead mt-1">{subtitle}</p>}
        <div className="mt-3">{children}</div>
    </section>
);

// --- Data (same as v2 — add/replace photo URLs as needed) --------------------
const leadership_DBMI = [
    {
        name: "Peter Park, PhD",
        title: "Professor of Biomedical Informatics",
        org: "DBMI",
        imgUrl: "https://dbmi.hms.harvard.edu/sites/default/files/profile-photos/peter_park_dbmi_2023c-400x480.png",
        profileUrl: "https://dbmi.hms.harvard.edu/people/peter-park"
    },
    {
        name: "Elizabeth Chun, PhD",
        title: "Research Associate; SMaHT Project Manager",
        org: "DBMI",
        imgUrl: "https://dbmi.hms.harvard.edu/sites/default/files/profile-photos/Elizabeth%20Chun.jpg",
        profileUrl: "https://dbmi.hms.harvard.edu/people/elizabeth-chun"
    },
    // {
    //     name: "Dominik Glodzik, PhD",
    //     title: "Instructor of Biomedical Informatics",
    //     org: "DBMI",
    //     imgUrl: "https://dbmi.hms.harvard.edu/sites/default/files/profile-photos/0064_Dominik_Glodzik_005-200x240.png",
    //     profileUrl: "https://dbmi.hms.harvard.edu/people/dominik-glodzik"
    // },
];

const steering_committee = [
    { name: "Isaac Kohane, MD, PhD", title: "Chair; Professor of Biomedical Informatics", org: "DBMI" },
    { name: "Susanne Churchill, PhD", title: "Executive Director", org: "DBMI" },
    { name: "Peter Park, PhD", title: "Professor of Biomedical Informatics", org: "DBMI", imgUrl: "https://dbmi.hms.harvard.edu/sites/default/files/profile-photos/peter_park_dbmi_2023c-400x480.png" },
    { name: "Elizabeth Chun, PhD", title: "Research Associate; SMaHT PM", org: "DBMI", imgUrl: "https://dbmi.hms.harvard.edu/sites/default/files/profile-photos/Elizabeth%20Chun.jpg" },
    // { name: "Dominik Glodzik, PhD", title: "Instructor of Biomedical Informatics", org: "DBMI", imgUrl: "https://dbmi.hms.harvard.edu/sites/default/files/profile-photos/0064_Dominik_Glodzik_005-200x240.png" },
];

const platform_bio = [
    { name: "Michele Berselli, PhD", title: "Sr. Bioinformatics Scientist", org: "DBMI", imgUrl: "https://dbmi.hms.harvard.edu/sites/default/files/profile-photos/Michele_Berselli.jpg" },
    { name: "Dominika Maziec, BSc", title: "Bioinformatics Engineer", org: "DBMI", imgUrl: "" },
    { name: "Alexander Veit, PhD", title: "Sr. Data Scientist", org: "DBMI", imgUrl: "https://dbmi.hms.harvard.edu/sites/default/files/profile-photos/AV%20new%20size.jpg" },
    { name: "William Feng, MSc", title: "Computational Biologist", org: "DBMI", imgUrl: "https://dbmi.hms.harvard.edu/sites/default/files/profile-photos/William%20Feng_0.jpg" }
];

const platform_curation = [
    { name: "Andy Schroeder, PhD", title: "Sr. Genomics Data Curator", org: "DBMI", imgUrl: "https://dbmi.hms.harvard.edu/sites/default/files/profile-photos/schroeder-5c0b01a01476401c9330cae475f19457.jpeg" },
    { name: "Sarah Nicholson, PhD", title: "Genomics Data Curator", org: "DBMI", imgUrl: "https://compbio.hms.harvard.edu/people/img/sarah-nicholson.jpg" },
];

const platform_frontend = [
    { name: "Shannon Ehmsen, ALM", title: "UX/UI Graphics Designer", org: "DBMI", imgUrl: "https://dbmi.hms.harvard.edu/sites/default/files/profile-photos/Shannon-Ehmsen-200x240.png" },
    { name: "Cesar Ferreyra-Mansilla, BA", title: "Front End Engineer", org: "DBMI", imgUrl: "https://dbmi.hms.harvard.edu/sites/default/files/profile-photos/ferreyra-mansilla-200x240.png" },
    { name: "Serkan Utku Öztürk, BSc", title: "Sr. Front End Engineer", org: "DBMI" },
];

const platform_coord = [
    { name: "Cassidy Perry, BS", title: "DBMI Project Coordinator", org: "DBMI", imgUrl: "https://dbmi.hms.harvard.edu/sites/default/files/profile-photos/Cassie%20Perry%20Headshot.jpg" },
];

const platform_alumni = [
    { name: "Doug Rioux, PhD", title: "Data Curator", org: "DBMI", imgUrl: "https://compbio.hms.harvard.edu/people/img/doug-rioux.jpg" },
    { name: "David Michaels, BSc", title: "Backend Engineer", org: "DBMI", imgUrl: "https://compbio.hms.harvard.edu/people/img/david-michaels.jpg" },
];

// --- Page --------------------------------------------------------------------
export default function TeamCGAP() {
    return (
        <div className="team-wrapper">
            <Container className="py-2 custom-xxl">
                <header className="text-center mb-5">
                    <h1 className="display-5 fw-normal mb-2">Meet the Team Behind SMaHT</h1>
                    <p className="lead mb-0">
                        SMaHT is built, maintained, and curated by experts in genomics and bioinformatics from <strong>DBMI at Harvard Medical School</strong>
                    </p>
                </header>

                {/* Leadership */}
                <Section title="Leadership" showLogo>
                    <Subgroup title="DAC Biomedical Informatics Leads" people={leadership_DBMI} />
                    {/* <Subgroup title="Steering Committee" people={steering_committee} /> */}
                </Section>

                {/* Platform */}
                <Section
                    title="DAC Platform Team"
                    subtitle="The multidisciplinary DAC Platform team works on SMaHT Platform"
                >
                    <Subgroup title="Bioinformatics" people={platform_bio} />
                    <Subgroup title="Data Curation" people={platform_curation} />
                    <Subgroup title="Front End Development" people={platform_frontend} />
                    <Subgroup title="Project Coordination" people={platform_coord} />
                    <Subgroup title="Alumni" people={platform_alumni} />
                </Section>

            </Container>

            {/* Styles */}
            <style>
                {`
        /* Constrain content width to 1200px at xxl and above */
        @media (min-width: 1400px) {
          .custom-xxl { max-width: 1200px; }
        }

        .rounded-circle { border-radius: 5% !important; }

        /* .team-wrapper { background: #f7fbff; } */

        /* Section title: big, bold, centered */
        .team-section-title {
          font-size: clamp(1.75rem, 1.2rem + 1.8vw, 2.5rem) !important;
          font-weight: 500 !important;
          color: #0f172a !important;
          margin: 0 0 1rem 0 !important;
          text-align: center;
          border-bottom: none !important;
        }

        /* === Screenshot-style subgroup heading === */
        .fancy-heading{
            display:flex;
            align-items:center;
            justify-content:center;
            gap:14px;
            margin: 6px 0 30px;
        }

        .fancy-line{
            height:1px;
            flex:1 1 0;
            background:#36c1fd;              /* soft blue line */
            border-radius:999px;
            opacity:.9;
        }

        .fancy-center{
            display:flex;
            align-items:center;
            gap:10px;
            white-space:nowrap;
        }

        .dna-icon{
            color:#5fa0ff;
            transform: rotate(28deg);         /* slight tilt like the screenshot */
            font-size: 1.35rem;
            line-height: 1;
        }

        .fancy-text{
            font-weight:500;
            color:#0f172a;
            letter-spacing:.2px;
            font-size: clamp(1.15rem, 0.95rem + 1vw, 1.75rem);
        }

        /* On narrow screens, keep lines shorter so the title fits */
        @media (max-width: 576px){
            .fancy-heading{ gap:10px; }
            .fancy-line{ opacity:.7; }
        }

        /* === FIXED CARD WIDTHS === */
        .card {
          box-shadow: none !important;  /* no shadow, no border */
        }
        .person-card {
          width: 250px;          /* fixed on desktop/tablet */
          align-items: center;
          padding-top: 1rem;
          background-color: #fff !important;
        }
        @media (max-width: 576px) {
          .person-card { width: 180px; }   /* smaller on phones */
        }

        /* Circular avatar (kept smaller than card width) */
        .person-avatar-wrap {
          width: 175px;
          height: 200px;
          margin: 0 auto 0.4rem auto;
          overflow: hidden;
          position: relative;
          outline: 1px solid rgba(0,0,0,0.05);
          transition: box-shadow 160ms ease-in-out;
        }
        @media (max-width: 576px) {
          .person-avatar-wrap { width: 120px; height: 120px; }
        }

        /* Photo grayscale -> color on hover */
        .person-avatar {
          width: 100%;
          height: 100%;
          object-fit: cover;
          filter: grayscale(100%);
          transition: filter 260ms ease-in-out, transform 260ms ease-in-out;
          display: block;
        }
        .person-card:hover .person-avatar {
          filter: grayscale(0%);
          transform: scale(1.02);
        }

        /* Placeholder circle */
        .placeholder-avatar {
          width: 100%;
          height: 100%;
          background: #e9ecef;
          color: #6c757d;
        }

        /* Hover ring accent */
        .person-card:hover .person-avatar-wrap {
          box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.12);
        }

        .person-title {
          color: #0e468b !important;
        }

        /* Text wrapping so long names don't stretch the card */
        .name, .wrap {
          word-break: break-word;
          overflow-wrap: anywhere;
          text-align: center;
        }

        /* Clickable name style (keeps the clean look) */
.person-name-link {
  /* color: inherit; */
  text-decoration: none;
}
.person-name-link:hover,
.person-name-link:focus {
  text-decoration: underline;
}


        /* Keep rows centered; columns are auto-width so cards stay fixed */
        .row.g-4.justify-content-center > [class*="col-"] {
          display: flex;
          justify-content: center;
        }
      `}
            </style>
        </div>
    );
}
