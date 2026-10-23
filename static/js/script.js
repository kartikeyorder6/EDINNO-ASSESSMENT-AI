

// Store selected PDF files for each resource
const selectedPDFs = new Map();
const topicsInput = document.getElementById("topics");
const activitiesInput = document.getElementById("activities");
const projectsInput = document.getElementById("projects");

const uploadContainer = document.getElementById("upload-container");

function generateUploadCards() {

    const topics = Number(topicsInput.value);
    const activities = Number(activitiesInput.value);
    const projects = Number(projectsInput.value);

    // Clear previous cards
    uploadContainer.innerHTML = "";

    // Generate Topic cards
    for (let i = 1; i <= topics; i++) {
        createUploadCard("Topic", i);
    }

    // Generate Activity cards
    for (let i = 1; i <= activities; i++) {
        createUploadCard("Activity", i);
    }

    // Generate Project cards
    for (let i = 1; i <= projects; i++) {
        createUploadCard("Project", i);
    }

    // Show empty state
    if (topics + activities + projects === 0) {
        uploadContainer.innerHTML = `
            <div class="upload-empty">
                <div class="upload-empty-icon">▤</div>
                <h3>Your resources will appear here</h3>
                <p>Enter the number of topics, activities and projects above.</p>
            </div>
        `;
    }
}

function createUploadCard(type, number) {

    const card = document.createElement("div");
    card.className = "pdf-upload-card";

    card.innerHTML = `
        <div class="pdf-info">
            <div class="pdf-icon">PDF</div>

            <div>
                <h4>${type} ${number}</h4>
                <p>No PDF selected</p>
            </div>
        </div>

        <label class="pdf-upload-button">
            Upload PDF
            <input
                type="file"
                accept=".pdf,application/pdf"
                hidden
            >
        </label>
    `;

    const fileInput = card.querySelector('input[type="file"]');
    const fileStatus = card.querySelector(".pdf-info p");
    
    // Restore previously selected PDF
    const resourceKey = `${type}-${number}`;

    if (selectedPDFs.has(resourceKey)) {
        const savedFile = selectedPDFs.get(resourceKey);

        fileStatus.textContent = savedFile.name;
        card.classList.add("uploaded");

        const uploadButton = card.querySelector(".pdf-upload-button");
        uploadButton.firstChild.textContent = "Change PDF";
    }


    fileInput.addEventListener("change", function () {

        const file = this.files[0];

        if (file) {
            if (!file.name.toLowerCase().endsWith(".pdf")) {
                alert("Please select a PDF file.");
                this.value = "";
                return;
            }
            
            selectedPDFs.set(`${type}-${number}`, file);
            validateAssessment();
            fileStatus.textContent = file.name;
            card.classList.add("uploaded");
            card.querySelector(".pdf-upload-button")
                .firstChild.textContent = "Change PDF";
        }
    });

    uploadContainer.appendChild(card);
}

// Listen for number changes
topicsInput.addEventListener("input", generateUploadCards);
activitiesInput.addEventListener("input", generateUploadCards);
projectsInput.addEventListener("input", generateUploadCards);

// Initial display
generateUploadCards();


// STEP 4.22 - Continue Button Validation

const chapterNameInput = document.getElementById("chapterName");
const continueButton = document.getElementById("continue-btn");
const uploadSummary = document.getElementById("upload-summary");

function validateAssessment() {
    const chapterName = chapterNameInput.value.trim();

    const topics = Number(topicsInput.value) || 0;
    const activities = Number(activitiesInput.value) || 0;
    const projects = Number(projectsInput.value) || 0;

    const validCounts = [topics, activities, projects].every(
        count => Number.isInteger(count) && count >= 0 && count <= 50
    );

    const totalResources = topics + activities + projects;

    let uploadedCount = 0;

    const resourceTypes = [
        ["Topic", topics],
        ["Activity", activities],
        ["Project", projects]
    ];

    resourceTypes.forEach(([type, count]) => {
        for (let i = 1; i <= count; i++) {
            if (selectedPDFs.has(`${type}-${i}`)) {
                uploadedCount++;
            }
        }
    });

    uploadSummary.textContent =
        `${uploadedCount} of ${totalResources} PDFs selected`;

    continueButton.disabled = !(
        chapterName &&
        validCounts &&
        totalResources > 0 &&
        uploadedCount === totalResources
    );
}

chapterNameInput.addEventListener("input", validateAssessment);

[topicsInput, activitiesInput, projectsInput].forEach(input => {
    input.addEventListener("input", validateAssessment);
});

validateAssessment();


// STEP 5.5 - Send PDFs to Flask Backend

continueButton.addEventListener("click", async function () {

    // Check all required inputs
    validateAssessment();

    if (continueButton.disabled) {
        return;
    }

    const formData = new FormData();

    const topics = Number(topicsInput.value);
    const activities = Number(activitiesInput.value);
    const projects = Number(projectsInput.value);

    const resources = [
        ["Topic", topics],
        ["Activity", activities],
        ["Project", projects]
    ];

    resources.forEach(([type, count]) => {
        for (let i = 1; i <= count; i++) {
            const file = selectedPDFs.get(`${type}-${i}`);

            if (file) {
                formData.append("pdfs", file);
            }
        }
    });

    continueButton.disabled = true;
    continueButton.textContent = "Processing PDFs...";

    try {
        const response = await fetch("/upload-pdfs", {
            method: "POST",
            body: formData
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || "PDF processing failed.");
        }

        // Temporarily store result for Screen 2
        window.mergedAssessmentData = {
            chapterName: chapterNameInput.value.trim(),
            ...result
        };

        
sessionStorage.setItem(
    "edinnoMergedData",
    JSON.stringify(window.mergedAssessmentData)
);

window.location.href = "/merge";


        console.log("Merged PDF Result:", window.mergedAssessmentData);

    } catch (error) {
        alert("Error: " + error.message);
    } finally {
        continueButton.textContent = "Continue to Content Merge →";
        validateAssessment();
    }
});
