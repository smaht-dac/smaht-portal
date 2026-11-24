.. raw:: html

    <div class="callout data-available mb-3">
        <span class="callout-text">
            <b>Data Access Update</b>: Protected-access data on the SMaHT Data Portal are currently available to verified SMaHT Network members.<br/>Other researchers can access these data through dbGaP. See <a href="#portal-access-to-protected-data">Portal Access to Protected Data</a> below.
        </span>
    </div>

.. raw:: html

    <h3>What are SMaHT Data?</h3>

The Somatic Mosaicism across Human Tissues (SMaHT) Network aims to create a reference catalog of somatic mutations and their patterns across a full spectrum of tissue types from 150 non-diseased donors, applying multiple state-of-the-art experimental assays and computational methods.

The data generated from the SMaHT Network provide a comprehensive and rich public resource for genomic studies that aim to characterize somatic mosaicism and understand its role in human biology and pathology.

The primary molecular assays of the SMaHT Network include bulk whole genome sequencing (WGS) using both Illumina-based short-read, and PacBio- or ONT-based long-read sequencing platforms, as well as bulk whole transcriptome sequencing on Illumina (total RNA-Seq) and PacBio (Kinnex) platforms.

.. raw:: html

    <h3 id="smaht-data-access">SMaHT Data Access</h3>

SMaHT data/metadata files are either open-access or protected-access. How you can access them depends on whether you are a SMaHT Network member. For self-registered Data Portal users who are not part of the SMaHT Network, the data are available after official data releases. See the table below for the access level of each data type.

**Open Access**: The open-access data/metadata files are available for download from the SMaHT Data Portal to all logged-in users, including SMaHT Network members and self-registered users who are not part of the SMaHT Network.

**Protected Access**: With the exception of the COLO829 and HapMap Mixture samples, sequence data (DNA and RNA), inherited germline variant data, and full donor metadata files are protected-access data. Following official data releases, these data are made available to researchers outside of the SMaHT Network through the NIH database of Genotypes and Phenotypes (`dbGaP <https://www.ncbi.nlm.nih.gov/gap/>`_). Researchers who are not members of the SMaHT Network must submit a Data Access Request (DAR) through the `dbGaP Authorized Access Portal <https://dbgap.ncbi.nlm.nih.gov/aa/landing/>`_ for the relevant SMaHT studies:

- **SMaHT Benchmarking Data**: dbGaP study `phs004193 <https://dbgap.ncbi.nlm.nih.gov/study/phs004193.v1.p1/#study>`_
- **SMaHT Production Data**: dbGaP study `phs004194 <https://dbgap.ncbi.nlm.nih.gov/study/phs004194.v1.p1/#study>`_

Upon approval by the NIH Data Access Committee, researchers can access and download the authorized protected-access data through dbGaP. Please see our `Getting dbGaP Access page </docs/access/getting-dbgap-access>`_ for more information on the SMaHT dbGaP studies and how to request access.

.. _portal-access-to-protected-data:

.. admonition:: Portal Access to Protected Data
   :class: tip

   Protected-access data on the SMaHT Data Portal are currently available to verified SMaHT Network members, while researchers outside of the SMaHT Network can access these data through dbGaP. Integration with the NIH Researcher Auth Service (RAS) is underway to enable researchers with approved dbGaP access to download protected data directly from the SMaHT Data Portal in the future.

|

.. raw:: html

    <br />
    <br />
    <div class="table-responsive">
        <table class="data-availability-table table-sm">
            <thead>
                <tr>
                    <th></th>
                    <th><b>COLO829</b></th>
                    <th><b>HapMap Mixture</b></th>
                    <th><b>LB-LA Fibroblasts and Derived iPSCs</b></th>
                    <th><b>Benchmarking Donors</b></th>
                    <th><b>Production Donors</b></th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="row-label"><b>Sequence Data</b><br/> &lpar;FASTQ, BAM/CRAM&rpar;</td>
                    <td class="open">open</td>
                    <td class="open">open</td>
                    <td class="protected">protected</td>
                    <td class="protected">protected</td>
                    <td class="protected">protected</td>
                </tr>
                <tr>
                    <td class="row-label"><b>Germline Variants</b><br/></td>
                    <td class="open">open</td>
                    <td class="open">open</td>
                    <td class="protected">protected</td>
                    <td class="protected">protected</td>
                    <td class="protected">protected</td>
                </tr>
                <tr>
                    <td class="row-label"><b>Somatic Variants</b><br/>&lpar;all variant types, from individual donor or aggregated samples&rpar;</td>
                    <td class="open">open</td>
                    <td class="open">open</td>
                    <td class="protected">protected</td>
                    <td class="protected">protected</td>
                    <td class="open">open</td>
                </tr>
                <tr>
                    <td class="row-label"><b>Gene Expression Profile</b><br/></td>
                    <td class="open">open</td>
                    <td class="open">open</td>
                    <td class="protected">protected</td>
                    <td class="protected">protected</td>
                    <td class="open">open</td>
                </tr>
                <tr>
                    <td class="row-label"><b>Epigenetic Profile</b><br/></td>
                    <td class="open">open</td>
                    <td class="open">open</td>
                    <td class="protected">protected</td>
                    <td class="protected">protected</td>
                    <td class="open">open</td>
                </tr>
                <tr>
                    <td class="row-label"><b>Limited Donor Metadata</b><br/> &lpar;i.e., age, sex, Hardy Scale&rpar;</td>
                    <td class="open">open</td>
                    <td class="open">open</td>
                    <td class="open">open</td>
                    <td class="open">open</td>
                    <td class="open">open</td>
                </tr>
                <tr>
                    <td class="row-label"><b>Full Donor Metadata</b><br/> &lpar;e.g., smoking status, environmental exposure, prior clinical history&rpar;</td>
                    <td class="not-applicable">N/A</td>
                    <td class="not-applicable">N/A</td>
                    <td class="not-applicable">N/A</td>
                    <td class="protected">protected</td>
                    <td class="protected">protected</td>
                </tr>
                <tr>
                    <td class="row-label"><b>Reference Files</b><br/> &lpar;e.g., Human genome reference, gene models, genome stratification into easy/difficult/extreme-to-map regions&rpar;</td>
                    <td class="open">open</td>
                    <td class="open">open</td>
                    <td class="open">open</td>
                    <td class="open">open</td>
                    <td class="open">open</td>
                </tr>
                <tr>
                    <td class="row-label"><b>Histology</b><br/> &lpar;Aperio SVS images, histology and pathology data&rpar;</td>
                    <td class="not-applicable">N/A</td>
                    <td class="not-applicable">N/A</td>
                    <td class="not-applicable">N/A</td>
                    <td class="not-applicable">N/A</td>
                    <td class="open">open</td>
                </tr>
            </tbody>
        </table>
    </div>
