==================================
SMaHT Sample and File Nomenclature
==================================


Overview
--------
The names of the SMaHT samples and files are unique identifiers that are permanent and immutable, and also contain metadata codes, which were included to make “the data about the data” (i.e., metadata) more accessible and obvious to downstream users.

This document describes the naming schema and metadata codes in the SMaHT sample and file names. Each metadata code in the sample and file names is delimited by a hyphen (“-”). As placeholders, “#” in this document indicates a single-digit integer (and similarly, “##” for double-digit numbers, “###” for three-digit numbers, etc.), and “A” indicates an alphabetical letter.


Schema Documentation
--------------------

.. raw:: html

    <div class="table-responsive"> 
        <table class="table table-borderless table-sm text-center">
            <thead class="thead-smaht">
                <tr>
                    <th>Download</th>
                    <th>Version</th>
                    <th>Release date</th>
                    <th>Filename</th>
                </tr>
            </thead>
            <tbody class="table-border-inner">
                <tr>
                    <td>
                        <a href="/static/files/SMaHT Sample and File Nomenclature v3.0.pdf" download>
                            <i class="icon fas icon-file-pdf text-danger icon-lg"></i>
                        </a>
                    </td>
                    <td>3.0 (latest)</td>
                    <td>2026-08-19</td>
                    <td><a href="/static/files/SMaHT Sample and File Nomenclature v3.0.pdf" download>SMaHT Sample and File Nomenclature v3.0.pdf</a></td>
                </tr>
            </tbody>
        </table>
    </div>



Part 1: Sample Schema and Protocol ID Tables
--------------------------------------------


Sample Schema
~~~~~~~~~~~~~

.. raw:: html
    
    <img class="grey-border" src="/static/img/Nomenclature_Part1.png" alt="Nomenclature Part 1"/>


Table 1. Donor identifiers for SMaHT benchmark cell lines.
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
.. raw:: html

    <div class="table-responsive">
        <table class="table table-sm text-start">
            <thead class="thead-smaht table-borderless">
                <tr>
                    <th>Donor ID</th>
                    <th>Cell line description</th>
                </tr>
            </thead>
            <tbody class="table-border-inner">
                <tr>
                    <td class="font-monospace">SMHTCOLO829T</td>
                    <td>COLO829 tumor cell line from ATCC, used in the benchmark studies by the SMaHT Network</td>
                </tr>
                <tr>
                    <td class="font-monospace">SMHTCOLO829BL</td>
                    <td>COLO829BL normal lymphoblast cell line from ATCC, used in the benchmark studies by the SMaHT Network</td>
                </tr>
                <tr>
                    <td class="font-monospace">SMHTCOLO829BLT50</td>
                    <td>Admixture of COLO829 and COLO829BL cell lines at a 1:49 mixture ratio, respectively, created by the University of Washington and used in the benchmark studies by the SMaHT Network</td>
                </tr>
                <tr>
                    <td class="font-monospace">SMHTHAPMAP6</td>
                    <td>Admixture of six HapMap cell lines, created for the Network at Coriell (see the SMaHT Data Portal for more details)</td>
                </tr>
                <tr>
                    <td class="font-monospace">SMHTLBLA2</td>
                    <td>LB-LA2 fibroblast cell line created by the Network</td>
                </tr>
                <tr>
                    <td class="font-monospace">SMHTLBIPSC1</td>
                    <td>iPSC line derived from Clone #1 from the parental LB-LA2 fibroblast cell line, created by the Network</td>
                </tr>
                <tr>
                    <td class="font-monospace">SMHTLBIPSC2</td>
                    <td>iPSC line derived from Clone #2 from the parental LB-LA2 fibroblast cell line, created by the Network</td>
                </tr>
                <tr>
                    <td class="font-monospace">SMHTLBIPSC4</td>
                    <td>iPSC line derived from Clone #4 from the parental LB-LA2 fibroblast cell line, created by the Network</td>
                </tr>
                <tr>
                    <td class="font-monospace">SMHTLBIPSC52</td>
                    <td>iPSC line derived from Clone #52 from the parental LB-LA2 fibroblast cell line, created by the Network</td>
                </tr>
                <tr>
                    <td class="font-monospace">SMHTLBIPSC60</td>
                    <td>iPSC line derived from Clone #60 from the parental LB-LA2 fibroblast cell line, created by the Network</td>
                </tr>
            </tbody>
        </table>
    </div>

    <caption>
        * LB-LA2 fibroblast and the iPSC cell lines are described in Fasching L et al. (2021) Science.
    </caption>


Figure 1. SMaHT Tissue Recovery Schema.
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. raw:: html
    
    <figure>
        <img
            class="grey-border"
            src="/static/img/Nomenclature_Fig1.png"
            alt="Nomenclature Fig. 1"
        />
        <figcaption>
            (a) Schema of the spatial relationship between fixed (pink) and frozen (green) tissue aliquots 
            recovered for each type of non-brain tissue for the SMaHT project. Larger tissue samples from 
            the lung and liver are recovered and sectioned into medial and lateral halves, as denoted by 
            the dotted red line in the upper right panel. Small organs (e.g., adrenal glands and gonads) 
            and the heart ventricle are bisected into anterior and posterior halves before aliquoting. (b) 
            Recovery and processing schema of the brain for SMaHT. (c) Standardized orientation of both fixed 
            and frozen aliquots prior to preservation from solid tissues. Frozen aliquots from mucosal tissues 
            (e.g., skin, colon, aorta, and esophagus) are all placed serosa side down in cassettes for 
            processing of a full-thickness sample (e.g., all cell layers). 
        </figcaption>
    </figure>


Figure 2. Example Standardized Tissue Coring Schema.
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. raw:: html

    <figure>
        <img
            class="grey-border"
            src="/static/img/Nomenclature_Fig2.png"
            alt="Nomenclature Fig. 2"
        />
        <figcaption>
            Representative diagram of the standardized coring schema for frozen solid tissue aliquots. 
            The core ID consists of a letter between A and F to denote the vertical position of the 
            core, followed by a single numerical digit between 1 and 6 to denote the horizontal position 
            of the core within the aliquot. “X” represents a null value, indicating samples that do not 
            get sub-sampled (e.g., non-solid tissues).
        </figcaption>
    </figure>


Table 2A. Benchmark tissue IDs.
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
.. raw:: html

    <caption>
        The benchmark tissue IDs contain information for both the tissue types and tissue preservation 
        methods. Snap-frozen tissue samples are sent to GCCs or TTDs for sequencing, while fixed tissue 
        samples are sent to pathologists for their review.
    </caption>

    <div class="table-responsive">
        <table class="table table-striped table-sm text-start">
            <thead class="thead-smaht table-borderless">
                <tr>
                    <th style="min-width:95px">Tissue ID</th>
                    <th style="min-width:200px">Tissue Name</th>
                    <th style="min-width:200px">Preservation Method</th>
                    <th style="min-width:200px">Notes</th>
                </tr>
            </thead>
            <tbody class="table-border-inner">
                <tr>
                    <td class="font-monospace">1A</td>
                    <td>Liver</td>
                    <td>Snap Frozen</td>
                    <td>For both homogenate and non-homogenate samples used in the SMaHT benchmark studies</td>
                </tr>
                <tr>
                    <td class="text-secondary fst-italic font-monospace">1B</td>
                    <td class="text-secondary fst-italic">unassigned</td>
                    <td class="text-secondary fst-italic">N/A</td>
                    <td></td>
                </tr>
                <tr>
                    <td class="font-monospace">1C</td>
                    <td>Liver</td>
                    <td>Fixed</td>
                    <td></td>
                </tr>
                <tr>
                    <td class="font-monospace">1D</td>
                    <td>Lung</td>
                    <td>Snap Frozen</td>
                    <td>For both homogenate and non-homogenate samples used in the SMaHT benchmark studies</td>
                </tr>
                <tr>
                    <td class="text-secondary fst-italic font-monospace">1E</td>
                    <td class="text-secondary fst-italic">unassigned</td>
                    <td class="text-secondary fst-italic">N/A</td>
                    <td></td>
                </tr>
                <tr>
                    <td class="font-monospace">1F</td>
                    <td>Lung</td>
                    <td>Fixed</td>
                    <td></td>
                </tr>
                <tr>
                    <td class="font-monospace">1G</td>
                    <td>Colon</td>
                    <td>Snap Frozen</td>
                    <td>For both homogenate and non-homogenate samples used in the SMaHT benchmark studies</td>
                </tr>
                <tr>
                    <td class="text-secondary fst-italic font-monospace">1H</td>
                    <td class="text-secondary fst-italic">unassigned</td>
                    <td class="text-secondary fst-italic">N/A</td>
                    <td></td>
                </tr>
                <tr>
                    <td class="font-monospace">1I</td>
                    <td>Colon</td>
                    <td>Fixed</td>
                    <td></td>
                </tr>
                <tr>
                    <td class="font-monospace">1J</td>
                    <td>Skin</td>
                    <td>Snap Frozen</td>
                    <td>Tissue specimen (~10 cm)</td>
                </tr>
                <tr>
                    <td class="font-monospace">1K</td>
                    <td>Skin</td>
                    <td>Snap Frozen</td>
                    <td>Larger tissue cores, each ~1 cm in diameter, were made from intact skin tissues</td>
                </tr>
                <tr>
                    <td class="font-monospace">1L</td>
                    <td>Skin</td>
                    <td>Fixed</td>
                    <td></td>
                </tr>
                <tr>
                    <td class="text-secondary fst-italic font-monospace">1M/N/O/P</td>
                    <td class="text-secondary fst-italic">unassigned</td>
                    <td class="text-secondary fst-italic">N/A</td>
                    <td></td>
                </tr>
                <tr>
                    <td class="font-monospace">1Q</td>
                    <td>Brain, Frontal lobe</td>
                    <td>Snap Frozen</td>
                    <td>For both homogenate and non-homogenate samples used in the SMaHT benchmark studies</td>
                </tr>
            </tbody>
        </table>
    </div>


Table 2B. Production tissue IDs.
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
.. raw:: html

    <caption>
        The production tissue IDs contain information for both the tissue types and tissue preservation 
        methods. Snap-frozen tissue samples are sent to GCCs or TTDs for sequencing, while fixed tissue 
        samples are sent to pathologists for their review.
    </caption>

    <div class="table-responsive">
        <table class="table table-striped table-sm text-start">
            <thead class="thead-smaht table-borderless">
                <tr>
                    <th style="min-width:95px">Protocol ID</th>
                    <th style="min-width:200px">Tissue Name for Container</th>
                    <th style="min-width:200px">Preservation</th>
                </tr>
            </thead>
            <tbody class="table-border-inner">
                <tr>
                    <td class="font-monospace">3A</td>
                    <td>Blood, Whole <span class="text-success">*</span></td>
                    <td>Snap Frozen</td>
                </tr>
                <tr>
                    <td class="font-monospace">3B</td>
                    <td>Buccal swab</td>
                    <td>Fresh</td>
                </tr>
                <tr>
                    <td class="font-monospace">3C</td>
                    <td>Esophagus</td>
                    <td>Snap Frozen</td>
                </tr>
                <tr>
                    <td class="font-monospace">3D</td>
                    <td>Esophagus</td>
                    <td>Fixed</td>
                </tr>
                <tr>
                    <td class="font-monospace">3E</td>
                    <td>Colon, Ascending</td>
                    <td>Snap Frozen</td>
                </tr>
                <tr>
                    <td class="font-monospace">3F</td>
                    <td>Colon, Ascending</td>
                    <td>Fixed</td>
                </tr>
                <tr>
                    <td class="font-monospace">3G</td>
                    <td>Colon, Descending</td>
                    <td>Snap Frozen</td>
                </tr>
                <tr>
                    <td class="font-monospace">3H</td>
                    <td>Colon, Descending</td>
                    <td>Fixed</td>
                </tr>
                <tr>
                    <td class="font-monospace">3I</td>
                    <td>Liver</td>
                    <td>Snap Frozen</td>
                </tr>
                <tr>
                    <td class="font-monospace">3J</td>
                    <td>Liver</td>
                    <td>Fixed</td>
                </tr>
                <tr>
                    <td class="font-monospace">3K</td>
                    <td>Adrenal gland, Left</td>
                    <td>Snap Frozen</td>
                </tr>
                <tr>
                    <td class="font-monospace">3L</td>
                    <td>Adrenal gland, Left</td>
                    <td>Fixed</td>
                </tr>
                <tr>
                    <td class="font-monospace">3M</td>
                    <td>Adrenal gland, Right</td>
                    <td>Snap Frozen</td>
                </tr>
                <tr>
                    <td class="font-monospace">3N</td>
                    <td>Adrenal gland, Right</td>
                    <td>Fixed</td>
                </tr>
                <tr>
                    <td class="font-monospace">3O</td>
                    <td>Aorta, Abdominal</td>
                    <td>Snap Frozen</td>
                </tr>
                <tr>
                    <td class="font-monospace">3P</td>
                    <td>Aorta, Abdominal</td>
                    <td>Fixed</td>
                </tr>
                <tr>
                    <td class="font-monospace">3Q</td>
                    <td>Lung</td>
                    <td>Snap Frozen</td>
                </tr>
                <tr>
                    <td class="font-monospace">3R</td>
                    <td>Lung</td>
                    <td>Fixed</td>
                </tr>
                <tr>
                    <td class="font-monospace">3S</td>
                    <td>Heart, Left ventricle</td>
                    <td>Snap Frozen</td>
                </tr>
                <tr>
                    <td class="font-monospace">3T</td>
                    <td>Heart, Left ventricle</td>
                    <td>Fixed</td>
                </tr>
                <tr>
                    <td class="font-monospace">3U</td>
                    <td>Testis, Left</td>
                    <td>Snap Frozen</td>
                </tr>
                <tr>
                    <td class="font-monospace">3V</td>
                    <td>Testis, Left</td>
                    <td>Fixed</td>
                </tr>
                <tr>
                    <td class="font-monospace">3W</td>
                    <td>Testis, Right</td>
                    <td>Snap Frozen</td>
                </tr>
                <tr>
                    <td class="font-monospace">3X</td>
                    <td>Testis, Right</td>
                    <td>Fixed</td>
                </tr>
                <tr>
                    <td class="font-monospace">3Y</td>
                    <td>Ovary, Left</td>
                    <td>Snap Frozen</td>
                </tr>
                <tr>
                    <td class="font-monospace">3Z</td>
                    <td>Ovary, Left</td>
                    <td>Fixed</td>
                </tr>
                <tr>
                    <td class="font-monospace">3AA</td>
                    <td>Ovary, Right</td>
                    <td>Snap Frozen</td>
                </tr>
                <tr>
                    <td class="font-monospace">3AB</td>
                    <td>Ovary, Right</td>
                    <td>Fixed</td>
                </tr>
                <tr>
                    <td class="font-monospace">3AC</td>
                    <td>Dermal fibroblast <span class="text-danger">*</span></td>
                    <td>Cultured Cells</td>
                </tr>
                <tr>
                    <td class="font-monospace">3AD</td>
                    <td>Skin, Calf</td>
                    <td>Snap Frozen</td>
                </tr>
                <tr>
                    <td class="font-monospace">3AE</td>
                    <td>Skin, Calf</td>
                    <td>Fixed</td>
                </tr>
                <tr>
                    <td class="font-monospace">3AF</td>
                    <td>Skin, Abdomen</td>
                    <td>Snap Frozen</td>
                </tr>
                <tr>
                    <td class="font-monospace">3AG</td>
                    <td>Skin, Abdomen</td>
                    <td>Fixed</td>
                </tr>
                <tr>
                    <td class="font-monospace">3AH</td>
                    <td>Muscle</td>
                    <td>Snap Frozen</td>
                </tr>
                <tr>
                    <td class="font-monospace">3AI</td>
                    <td>Muscle</td>
                    <td>Fixed</td>
                </tr>
                <tr>
                    <td class="font-monospace">3AJ</td>
                    <td>Brain</td>
                    <td>Fresh</td>
                </tr>
                <tr>
                    <td class="font-monospace">3AK</td>
                    <td>Frontal lobe, Brain, Left hemisphere</td>
                    <td>Snap Frozen</td>
                </tr>
                <tr>
                    <td class="font-monospace">3AL</td>
                    <td>Temporal lobe, Brain, Left hemisphere</td>
                    <td>Snap Frozen</td>
                </tr>
                <tr>
                    <td class="font-monospace">3AM</td>
                    <td>Cerebellum, Brain, Left hemisphere</td>
                    <td>Snap Frozen</td>
                </tr>
                <tr>
                    <td class="font-monospace">3AN</td>
                    <td>Hippocampus, Brain, Left hemisphere</td>
                    <td>Snap Frozen</td>
                </tr>
                <tr>
                    <td class="font-monospace">3AO</td>
                    <td>Hippocampus, Brain, Right hemisphere</td>
                    <td>Snap Frozen</td>
                </tr>
                <tr>
                    <td class="font-monospace">3AP</td>
                    <td>Frontal lobe, Brain, Left hemisphere</td>
                    <td>Fixed</td>
                </tr>
                <tr>
                    <td class="font-monospace">3AQ</td>
                    <td>Temporal lobe, Brain, Left hemisphere</td>
                    <td>Fixed</td>
                </tr>
                <tr>
                    <td class="font-monospace">3AR</td>
                    <td>Cerebellum, Brain, Left hemisphere</td>
                    <td>Fixed</td>
                </tr>
                <tr>
                    <td class="font-monospace">3AS</td>
                    <td>Hippocampus, Brain, Left hemisphere</td>
                    <td>Fixed</td>
                </tr>
                <tr>
                    <td class="font-monospace">3AT</td>
                    <td>Hippocampus, Brain, Right hemisphere</td>
                    <td>Fixed</td>
                </tr>
            </tbody>
        </table>
    </div>
    
    <caption>
        <span class="text-success">*</span> Whole blood was collected from either 
        the clavicle or femoral vein from a post-mortem donor. A total of 12 mL of 
        blood is collected at one time, pooled and mixed with anticoagulant. The 
        pooled mixture is then aliquoted into twelve 1 mL aliquots and flash-frozen 
        for distribution to sequence at GCCs/TTDs.
    </caption>
    <br/>
    <caption>
        <span class="text-danger">*</span> Fibroblasts are isolated from a patch of 
        fresh calf skin and are not derived from a single cell.
    </caption>


Part 2: Base Schema, Platform, and Assay Codes
----------------------------------------------

Base Schema
~~~~~~~~~~~~~

.. raw:: html
    
    <img class="grey-border" src="/static/img/Nomenclature_Part2.png" alt="Nomenclature Part 2"/>



Table 3A. Sequencing platform codes.
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. raw:: html

    <div class="table-responsive">
        <table class="table table-striped table-sm">
            <thead class="thead-smaht table-borderless">
                <tr>
                    <th class="text-center" width="25%">SMaHT code</th>
                    <th class="text-start">Sequencing platform</th>
                </tr>
            </thead>
            <tbody class="table-border-inner">
                <tr>
                    <td class="text-center font-monospace">A</td>
                    <td class="text-start">Illumina NovaSeq X, Illumina NovaSeq X Plus</td>
                </tr>
                <tr>
                    <td class="text-center font-monospace">B</td>
                    <td class="text-start">PacBio Revio HiFi</td>
                </tr>
                <tr>
                    <td class="text-center font-monospace">C</td>
                    <td class="text-start">Illumina NovaSeq 6000</td>
                </tr>
                <tr>
                    <td class="text-center font-monospace">D</td>
                    <td class="text-start">ONT PromethION 24</td>
                </tr>
                <tr>
                    <td class="text-center font-monospace">E</td>
                    <td class="text-start">ONT PromethION 2 Solo</td>
                </tr>
                <tr>
                    <td class="text-center font-monospace">F</td>
                    <td class="text-start">ONT MinION Mk1B</td>
                </tr>
                <tr>
                    <td class="text-center font-monospace">G</td>
                    <td class="text-start">Illumina HiSeq X</td>
                </tr>
                <tr>
                    <td class="text-center text-secondary fst-italic font-monospace">H [deprecated]</td>
                    <td class="text-start text-secondary fst-italic">Illumina NovaSeq X Plus</td>
                </tr>
                <tr>
                    <td class="text-center font-monospace">I</td>
                    <td class="text-start">BGI DNBSEQ-G400</td>
                </tr>
                <tr>
                    <td class="text-center font-monospace">J</td>
                    <td class="text-start">Element AVITI</td>
                </tr>
                <tr>
                    <td class="text-center font-monospace">K</td>
                    <td class="text-start">Illumina NextSeq 2000</td>
                </tr>
                <tr>
                    <td class="text-center font-monospace">L</td>
                    <td class="text-start">PacBio Sequel IIe</td>
                </tr>
                <tr>
                    <td class="text-center font-monospace">M</td>
                    <td class="text-start">Ultima Genomics UG 100</td>
                </tr>
                <tr>
                    <td class="text-center font-monospace">N</td>
                    <td class="text-start">PacBio Onso</td>
                </tr>
                <tr>
                    <td class="text-center font-monospace">O</td>
                    <td class="text-start">MGI DNBSEQ-T7</td>
                </tr>
                <tr>
                    <td class="text-center font-monospace">P</td>
                    <td class="text-start">Roche Axelios 1</td>
                </tr>
            </tbody>
        </table>
    </div>



Table 3B. Experimental assay codes.
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. raw:: html

    <div class="table-responsive">
        <table class="table table-sm text-start">
            <thead class="thead-smaht table-borderless">
                <tr>
                    <th>Code</th>
                    <th>Assay Name</th>
                    <th>Description</th>
                </tr>
            </thead>
            <tbody class="table-border-inner">
                <tr>
                    <td class="font-monospace">000</td>
                    <td></td>
                    <td>(Null or not-applicable)</td>
                </tr>
                <tr class="table-stripe-secondary text-600 fst-italic">
                    <td colspan="3">[001-100: DNA-based assays]</td>
                </tr>
                <tr>
                    <td class="font-monospace">001</td>
                    <td>WGS</td>
                    <td>DNA, PCR-free, Bulk, Whole genome sequencing (WGS)</td>
                </tr>
                <tr>
                    <td class="font-monospace">002</td>
                    <td>PCR WGS</td>
                    <td>DNA PCR, Bulk, WGS</td>
                </tr>
                <tr>
                    <td class="font-monospace">003</td>
                    <td>Ultra-Long WGS</td>
                    <td>DNA, PCR-free, Bulk, Ultra-Long WGS</td>
                </tr>
                <tr>
                    <td class="font-monospace">004</td>
                    <td>Fiber-seq</td>
                    <td>DNA, PCR-free, Bulk, Fiber-seq</td>
                </tr>
                <tr>
                    <td class="font-monospace">005</td>
                    <td>Hi-C</td>
                    <td>DNA, Bulk, Hi-C</td>
                </tr>
                <tr>
                    <td class="font-monospace">006</td>
                    <td>Bulk NTSeq</td>
                    <td>DNA, Bulk, NTSeq</td>
                </tr>
                <tr>
                    <td class="font-monospace">007</td>
                    <td>CODEC</td>
                    <td>DNA, Bulk, Duplex-seq, CODEC</td>
                </tr>
                <tr>
                    <td class="font-monospace">008</td>
                    <td>Bot-seq</td>
                    <td>DNA, Bulk, Duplex-seq, Bot-seq</td>
                </tr>
                <tr>
                    <td class="font-monospace">009</td>
                    <td>NanoSeq</td>
                    <td>DNA, Bulk, Duplex-seq, NanoSeq</td>
                </tr>
                <tr>
                    <td class="font-monospace">010</td>
                    <td>scNanoSeq</td>
                    <td>DNA, Single-cell, Duplex-seq, scNanoSeq</td>
                </tr>
                <tr>
                    <td class="font-monospace">011</td>
                    <td>DLP+</td>
                    <td>DNA, Single-cell, DLP+</td>
                </tr>
                <tr>
                    <td class="font-monospace">012</td>
                    <td>Microbulk MALBAC WGS</td>
                    <td>DNA, Microbulk, MALBAC-amplified WGS</td>
                </tr>
                <tr>
                    <td class="font-monospace">013</td>
                    <td>Single-cell MALBAC WGS</td>
                    <td>DNA, Single-cell, MALBAC-amplified WGS</td>
                </tr>
                <tr>
                    <td class="font-monospace">014</td>
                    <td>Microbulk PTA WGS</td>
                    <td>DNA, Microbulk, PTA-amplified WGS</td>
                </tr>
                <tr>
                    <td class="font-monospace">015</td>
                    <td>Single-cell PTA WGS</td>
                    <td>DNA, Single-cell, PTA-amplified WGS</td>
                </tr>
                <tr>
                    <td class="font-monospace">016</td>
                    <td>scDip-C</td>
                    <td>DNA, Single-cell, scDip-C</td>
                </tr>
                <tr>
                    <td class="font-monospace">017</td>
                    <td>CompDuplex-seq</td>
                    <td>DNA, Bulk, Duplex-seq, CompDuplex-seq</td>
                </tr>
                <tr>
                    <td class="font-monospace">018</td>
                    <td>scCompDuplex-seq</td>
                    <td>DNA, Single-cell, Duplex-seq, scCompDuplex-seq</td>
                </tr>
                <tr>
                    <td class="font-monospace">019</td>
                    <td>Strand-seq</td>
                    <td>DNA, Bulk, Strand-seq</td>
                </tr>
                <tr>
                    <td class="font-monospace">020</td>
                    <td>scStrand-seq</td>
                    <td>DNA, Single-cell, scStrand-seq</td>
                </tr>
                <tr>
                    <td class="font-monospace">021</td>
                    <td>HiDEF-seq</td>
                    <td>DNA, Bulk, Duplex-seq, HiDEF-seq</td>
                </tr>
                <tr>
                    <td class="font-monospace">022</td>
                    <td>HAT-seq</td>
                    <td>DNA, Bulk, HAT-seq</td>
                </tr>
                <tr>
                    <td class="font-monospace">023</td>
                    <td>Microbulk HAT-seq</td>
                    <td>DNA, Microbulk, PTA-amplified HAT-seq</td>
                </tr>
                <tr>
                    <td class="font-monospace">024</td>
                    <td>scHAT-seq</td>
                    <td>DNA, Single-cell, PTA-amplified, HAT-seq</td>
                </tr>
                <tr>
                    <td class="font-monospace">025</td>
                    <td>META-VISTA-seq</td>
                    <td>DNA, Bulk, Duplex-seq, META-VISTA-seq</td>
                </tr>
                <tr>
                    <td class="font-monospace">026</td>
                    <td>Microbulk META-VISTA-seq</td>
                    <td>DNA, Microbulk, Duplex-seq, META-VISTA-seq</td>
                </tr>
                <tr>
                    <td class="font-monospace">027</td>
                    <td>scMETA-VISTA-seq</td>
                    <td>DNA, Single-cell, Duplex-seq, META-VISTA-seq</td>
                </tr>
                <tr>
                    <td class="font-monospace">028</td>
                    <td>TEnCATS</td>
                    <td>DNA, Bulk, TEnCATS</td>
                </tr>
                <tr>
                    <td class="font-monospace">029</td>
                    <td>L1-ONT</td>
                    <td>DNA, Bulk, L1-ONT</td>
                </tr>
                <tr>
                    <td class="font-monospace">030</td>
                    <td>ppmSeq</td>
                    <td>DNA, Bulk, Duplex-seq, ppmSeq</td>
                </tr>
                <tr>
                    <td class="font-monospace">031</td>
                    <td>SBX-D</td>
                    <td>DNA, Bulk, Duplex-seq, SBX-D</td>
                </tr>
                <tr>
                    <td colspan="3" class="pb-3 pt-07"></td>
                </tr>
                <tr class="table-stripe-secondary fst-italic text-600">
                    <td colspan="3">[101-200: RNA-based assays]</td>
                </tr>
                <tr>
                    <td class="font-monospace">101</td>
                    <td>RNA-seq</td>
                    <td>RNA, Bulk, RNA-seq</td>
                </tr>
                <tr>
                    <td class="font-monospace">102</td>
                    <td>Kinnex</td>
                    <td>RNA, Bulk, Kinnex</td>
                </tr>
                <tr>
                    <td class="font-monospace">103</td>
                    <td>snRNA-seq</td>
                    <td>RNA, Single-cell, snRNA-seq</td>
                </tr>
                <tr>
                    <td class="font-monospace">104</td>
                    <td>STORM-Seq</td>
                    <td>RNA, Single-cell, STORM-seq</td>
                </tr>
                <tr>
                    <td class="font-monospace">105</td>
                    <td>Tranquil-Seq</td>
                    <td>RNA, Single-cell, Tranquil-seq</td>
                </tr>
                <tr>
                    <td colspan="3" class="pb-3 pt-07"></td>
                </tr>
                <tr class="table-stripe-secondary fst-italic text-600">
                    <td colspan="3">[201-300: Chromatin-based assays]</td>
                </tr>
                <tr>
                    <td class="font-monospace">201</td>
                    <td>ATAC-seq</td>
                    <td>Chromatin, Bulk, ATAC-seq</td>
                </tr>
                <tr>
                    <td class="font-monospace">202</td>
                    <td>CUT&Tag</td>
                    <td>Chromatin, Bulk, CUT&Tag</td>
                </tr>
                <tr>
                    <td class="font-monospace">203</td>
                    <td>varCUT&Tag</td>
                    <td>Chromatin, Bulk, varCUT&Tag</td>
                </tr>
                <tr>
                    <td class="font-monospace">204</td>
                    <td>sc-varCUT&Tag</td>
                    <td>Chromatin, Single-cell, sc-varCUT&Tag</td>
                </tr>
                <tr>
                    <td colspan="3" class="pb-3 pt-07"></td>
                </tr>
            </tbody>
        </table>
    </div>


Table 4. Codes for centers in the SMaHT Network.
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. raw:: html

    <caption>
        GCCs, TTDs, the DAC, and the TPC, as well as the contact PI of each center, are shown below.
    </caption>

    <div class="table-responsive">
        <table class="table table-striped table-sm text-start">
            <thead class="thead-smaht table-borderless">
                <tr>
                    <th>Data Portal Code</th>
                    <th>Center Category</th>
                    <th>Full Name of the Center</th>
                    <th>Contact PI</th>
                </tr>
            </thead>
            <tbody class="table-border-inner">
                <tr>
                    <td class="font-monospace">bcm</td>
                    <td>GCC</td>
                    <td>Baylor College of Medicine</td>
                    <td>Richard Gibbs</td>
                </tr>
                <tr>
                    <td class="font-monospace">broad</td>
                    <td>GCC</td>
                    <td>Broad Institute of MIT and Harvard</td>
                    <td>Kristin Ardlie</td>
                </tr>
                <tr>
                    <td class="font-monospace">nygc</td>
                    <td>GCC</td>
                    <td>New York Genome Center</td>
                    <td>Nicolas Robine</td>
                </tr>
                <tr>
                    <td class="font-monospace">uwsc</td>
                    <td>GCC</td>
                    <td>University of Washington & Seattle Children’s Research Institute</td>
                    <td>Jimmy Bennett</td>
                </tr>
                <tr>
                    <td class="font-monospace">washu</td>
                    <td>GCC</td>
                    <td>Washington University in St. Louis and Van Andel Institute</td>
                    <td>Ting Wang</td>
                </tr>
                <tr>
                    <td class="font-monospace">bcm1</td>
                    <td>TTD</td>
                    <td>Baylor College of Medicine</td>
                    <td>Chuck Zong</td>
                </tr>
                <tr>
                    <td class="font-monospace">bcm2</td>
                    <td>TTD</td>
                    <td>Baylor College of Medicine</td>
                    <td>Fritz Sedlazeck</td>
                </tr>
                <tr>
                    <td class="font-monospace">bch1</td>
                    <td>TTD</td>
                    <td>Boston Children’s Hospital</td>
                    <td>Christopher Walsh</td>
                </tr>
                <tr>
                    <td class="font-monospace">bch2</td>
                    <td>TTD</td>
                    <td>Boston Children’s Hospital</td>
                    <td>Sangita Choudhury</td>
                </tr>
                <tr>
                    <td class="font-monospace">broad1</td>
                    <td>TTD</td>
                    <td>Broad Institute of MIT and Harvard</td>
                    <td>Fei Chen</td>
                </tr>
                <tr>
                    <td class="font-monospace">cwru</td>
                    <td>TTD</td>
                    <td>Case Western Reserve University</td>
                    <td>Fulai Jin</td>
                </tr>
                <tr>
                    <td class="font-monospace">dfci</td>
                    <td>TTD</td>
                    <td>Dana-Farber Cancer Institute</td>
                    <td>Kathleen Burns</td>
                </tr>
                <tr>
                    <td class="font-monospace">mayo</td>
                    <td>TTD</td>
                    <td>Mayo Clinic</td>
                    <td>Alexej Abyzov</td>
                </tr>
                <tr>
                    <td class="font-monospace">nyu</td>
                    <td>TTD</td>
                    <td>New York University</td>
                    <td>Gilad Evrony</td>
                </tr>
                <tr>
                    <td class="font-monospace">stfd</td>
                    <td>TTD</td>
                    <td>Stanford University</td>
                    <td>Alexander Urban</td>
                </tr>
                <tr>
                    <td class="font-monospace">umass</td>
                    <td>TTD</td>
                    <td>University of Massachusetts</td>
                    <td>Thomas Fazzio</td>
                </tr>
                <tr>
                    <td class="font-monospace">umich</td>
                    <td>TTD</td>
                    <td>University of Michigan</td>
                    <td>Ryan Mills</td>
                </tr>
                <tr>
                    <td class="font-monospace">uutah</td>
                    <td>TTD</td>
                    <td>University of Utah</td>
                    <td>Gabor Marth</td>
                </tr>
                <tr>
                    <td class="font-monospace">wcnygc</td>
                    <td>TTD</td>
                    <td>Weill Cornell Medicine & New York Genome Center</td>
                    <td>Dan Landau</td>
                </tr>
                <tr>
                    <td class="font-monospace">dac</td>
                    <td>DAC</td>
                    <td>Harvard Medical School</td>
                    <td>Peter Park</td>
                </tr>
                <tr>
                    <td class="font-monospace">tpc</td>
                    <td>TPC</td>
                    <td>National Disease Research Interchange (NDRI)</td>
                    <td>Thomas Bell</td>
                </tr>
            </tbody>
        </table>
    </div>


Part 3: File Name breakdown
---------------------------

File Name
~~~~~~~~~

.. raw:: html

    <img class="grey-border" src="/static/img/Nomenclature_Part3.png" alt="Nomenclature Part 3"/>


Table 5. Genome version (A) and data type (B) codes.
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. raw:: html

    <div class="table-responsive">
        <table class="table table-sm text-start">
            <caption style="caption-side:top;">(A)</caption>
            <thead class="thead-smaht table-borderless">
                <tr>
                    <th>Reference Genome</th>
                    <th>Code in the file name</th>
                </tr>
            </thead>
            <tbody class="table-border-inner">
                <tr>
                    <td>GRCh38 without ALT contigs</td>
                    <td class="font-monospace">GRCh38</td>
                </tr>
                <tr>
                    <td>GRCh38 with ALT contigs</td>
                    <td class="font-monospace">GRCh38_ALT</td>
                </tr>
                <tr>
                    <td>T2T CHM13</td>
                    <td class="font-monospace">CHM13</td>
                </tr>
                <tr>
                    <td>Donor-specific genome assembly</td>
                    <td class="font-monospace">DSA</td>
                </tr>
            </tbody>
        </table>
        <table class="table table-sm text-start">
            <caption style="caption-side:top;">(B)</caption>
            <thead class="thead-smaht table-borderless">
                <tr>
                    <th>Data Type</th>
                    <th>Code in the file name</th>
                </tr>
            </thead>
            <tbody class="table-border-inner">
                <tr>
                    <td>Single nucleotide variants</td>
                    <td class="font-monospace">snv</td>
                </tr>
                <tr>
                    <td>Short insertions and deletions</td>
                    <td class="font-monospace">indel</td>
                </tr>
                <tr>
                    <td>Structural variants, including large insertions and deletions, duplications, inversions, and translocations</td>
                    <td class="font-monospace">sv</td>
                </tr>
                <tr>
                    <td>Copy number variants</td>
                    <td class="font-monospace">cnv</td>
                </tr>
                <tr>
                    <td>Mobile element insertions</td>
                    <td class="font-monospace">mei</td>
                </tr>
                <tr>
                    <td>Reference conversion</td>
                    <td>[Source]<span class="font-monospace">To</span>[Target]</td>
                </tr>
                <tr>
                    <td>Donor-specific genome assembly haplotype</td>
                    <td class="font-monospace">hapX, hapY, hapX1, hapX2</td>
                </tr>
                <tr>
                    <td>Gene expression level</td>
                    <td class="font-monospace">gene</td>
                </tr>
                <tr>
                    <td>Transcript isoform expression level or other isoform-level information</td>
                    <td class="font-monospace">isoform</td>
                </tr>
                <tr>
                    <td>Exon/Intron junction annotations</td>
                    <td class="font-monospace">junction</td>
                </tr>
                <tr>
                    <td>Full-length, non-concatemer (FLNC) Kinnex</td>
                    <td class="font-monospace">flnc</td>
                </tr>
                <tr>
                    <td>Aligned consensus reads from Duplex-seq data</td>
                    <td class="font-monospace">consensus</td>
                </tr>
                <tr>
                    <td>Metadata information</td>
                    <td class="font-monospace">metadata</td>
                </tr>
            </tbody>
        </table>
    </div>