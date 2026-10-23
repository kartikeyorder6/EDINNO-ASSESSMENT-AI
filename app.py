import io
import json
import re

from flask import (
    Flask,
    Response,
    jsonify,
    render_template,
    request,
    send_file,
)

from services.pdf_reader import extract_pdf_text
from services.ai_generator import (
    generate_assessment,
    detect_project_title,
)
from services.pdf_generator import create_assessment_pdf


# =========================================================
# APP
# =========================================================

app = Flask(__name__)

app.config["MAX_CONTENT_LENGTH"] = (
    100 * 1024 * 1024
)

app.config["JSON_SORT_KEYS"] = False


# =========================================================
# RESPONSE HELPERS
# =========================================================

def json_response(
    payload,
    status=200
):
    """
    Explicit JSON response helper.

    This avoids browser-side hanging caused by an incomplete
    response path and also disables caching.
    """

    response = Response(
        json.dumps(
            payload,
            ensure_ascii=False
        ),
        status=status,
        mimetype="application/json",
    )

    response.headers[
        "Cache-Control"
    ] = (
        "no-store, no-cache, "
        "must-revalidate, max-age=0"
    )

    response.headers[
        "Pragma"
    ] = "no-cache"

    response.headers[
        "Expires"
    ] = "0"

    return response


# =========================================================
# FILE NAME HELPERS
# =========================================================

def clean_filename_title(
    filename
):

    filename = str(
        filename or ""
    ).strip()

    filename = re.sub(
        r"\.pdf$",
        "",
        filename,
        flags=re.IGNORECASE
    )

    filename = re.sub(
        r"[_\-]+",
        " ",
        filename
    )

    filename = re.sub(
        r"\s+",
        " ",
        filename
    )

    return filename.strip()


# =========================================================
# PAGES
# =========================================================

@app.route("/")
def index():

    return render_template(
        "index.html"
    )


@app.route("/merge")
def merge_page():

    return render_template(
        "merge.html"
    )


@app.route("/assessment-type")
def assessment_type_page():

    return render_template(
        "assessment_type.html"
    )


@app.route("/results")
def results_page():

    return render_template(
        "results.html"
    )


# =========================================================
# UPLOAD + MERGE PDFs
# =========================================================

@app.route(
    "/upload-pdfs",
    methods=["POST"]
)
def upload_pdfs():

    try:

        uploaded_files = (
            request.files.getlist(
                "pdfs"
            )
        )

        if not uploaded_files:

            return json_response(
                {
                    "success": False,
                    "message":
                        "No PDF files were uploaded.",
                },
                400
            )

        combined_sections = []

        accepted_files = []

        for index, pdf_file in enumerate(
            uploaded_files,
            start=1
        ):

            filename = str(
                pdf_file.filename or ""
            ).strip()

            if not filename:

                continue

            if not filename.lower().endswith(
                ".pdf"
            ):

                continue

            try:

                pdf_file.stream.seek(
                    0
                )

            except Exception:
                pass

            extracted_text = (
                extract_pdf_text(
                    pdf_file
                )
            )

            if not extracted_text.strip():

                continue

            accepted_files.append(
                filename
            )

            combined_sections.append(
                (
                    "\n\n"
                    "========================================\n"
                    f"RESOURCE {index}: {filename}\n"
                    "========================================\n"
                    f"{extracted_text.strip()}"
                )
            )

        if not combined_sections:

            return json_response(
                {
                    "success": False,
                    "message":
                        (
                            "No readable text was found "
                            "in the uploaded PDFs."
                        ),
                },
                400
            )

        combined_content = (
            "\n".join(
                combined_sections
            ).strip()
        )

        return json_response(
            {
                "success": True,

                "total_files":
                    len(
                        accepted_files
                    ),

                "files":
                    accepted_files,

                "combined_content":
                    combined_content,
            }
        )

    except Exception as error:

        print(
            "PDF merge error:",
            error,
            flush=True
        )

        return json_response(
            {
                "success": False,
                "message":
                    str(error),
            },
            500
        )


# =========================================================
# GENERATE NORMAL ASSESSMENT
# =========================================================

@app.route(
    "/generate-assessment",
    methods=["POST"]
)
def generate_assessment_route():

    try:

        data = (
            request.get_json(
                silent=True
            )
            or
            {}
        )

        chapter_content = str(
            data.get(
                "chapter_content",
                ""
            )
        ).strip()

        assessment_type = str(
            data.get(
                "assessment_type",
                ""
            )
        ).strip().lower()

        if not chapter_content:

            return json_response(
                {
                    "success": False,
                    "message":
                        (
                            "Merged chapter content "
                            "is missing."
                        ),
                },
                400
            )

        if not assessment_type:

            return json_response(
                {
                    "success": False,
                    "message":
                        (
                            "Assessment type "
                            "is missing."
                        ),
                },
                400
            )

        print(
            "",
            flush=True
        )

        print(
            "Generating assessment:",
            flush=True
        )

        print(
            (
                "Assessment type: "
                f"{assessment_type}"
            ),
            flush=True
        )

        print(
            (
                "Source characters: "
                f"{len(chapter_content)}"
            ),
            flush=True
        )

        # =================================================
        # AI GENERATION
        # =================================================

        assessment = (
            generate_assessment(
                chapter_content=
                    chapter_content,

                assessment_type=
                    assessment_type
            )
        )

        # =================================================
        # HARD RESPONSE VALIDATION
        # =================================================

        if not isinstance(
            assessment,
            dict
        ):

            raise ValueError(
                (
                    "Assessment generator "
                    "returned invalid data."
                )
            )

        questions = assessment.get(
            "questions"
        )

        if not isinstance(
            questions,
            list
        ):

            raise ValueError(
                (
                    "Generated assessment "
                    "contains no valid questions list."
                )
            )

        if not questions:

            raise ValueError(
                (
                    "Generated assessment "
                    "contains no questions."
                )
            )

        # =================================================
        # MIXED HARD CHECK
        # =================================================

        if (
            assessment_type
            ==
            "mixed"
        ):

            if len(
                questions
            ) != 10:

                raise ValueError(
                    (
                        "Mixed assessment must "
                        "contain exactly 10 questions."
                    )
                )

            first_five = (
                questions[:5]
            )

            last_five = (
                questions[5:]
            )

            for index, item in enumerate(
                first_five,
                start=1
            ):

                if (
                    item.get(
                        "question_type"
                    )
                    !=
                    "mcq"
                ):

                    raise ValueError(
                        (
                            f"Question {index} "
                            "must be MCQ."
                        )
                    )

                options = item.get(
                    "options"
                )

                if (
                    not isinstance(
                        options,
                        list
                    )
                    or
                    len(options) != 4
                ):

                    raise ValueError(
                        (
                            f"Question {index} "
                            "must contain 4 options."
                        )
                    )

            for local_index, item in enumerate(
                last_five,
                start=6
            ):

                if (
                    item.get(
                        "question_type"
                    )
                    !=
                    "true_false"
                ):

                    raise ValueError(
                        (
                            f"Question {local_index} "
                            "must be True/False."
                        )
                    )

        # =================================================
        # RESPONSE
        # =================================================

        payload = {
            "success": True,
            "assessment":
                assessment,
        }

        print(
            (
                "Assessment ready for browser: "
                f"{len(questions)} questions."
            ),
            flush=True
        )

        print(
            (
                "Sending HTTP 200 response "
                "to browser now..."
            ),
            flush=True
        )

        response = json_response(
            payload,
            200
        )

        print(
            "HTTP response created successfully.",
            flush=True
        )

        return response

    except Exception as error:

        print(
            (
                "Assessment generation error: "
                f"{error}"
            ),
            flush=True
        )

        return json_response(
            {
                "success": False,
                "message":
                    str(error),
            },
            500
        )


# =========================================================
# PROJECT NAME DETECTION
# =========================================================

@app.route(
    "/detect-project-name",
    methods=["POST"]
)
def detect_project_name_route():

    try:

        pdf_file = (
            request.files.get(
                "ebook_pdf"
            )
        )

        if not pdf_file:

            return json_response(
                {
                    "success": False,
                    "message":
                        "Project PDF is missing.",
                },
                400
            )

        filename = str(
            pdf_file.filename or ""
        ).strip()

        pdf_file.stream.seek(
            0
        )

        content = extract_pdf_text(
            pdf_file
        )

        fallback_title = (
            clean_filename_title(
                filename
            )
        )

        project_name = (
            detect_project_title(
                content,
                fallback_title
            )
        )

        return json_response(
            {
                "success": True,
                "project_name":
                    project_name,
            }
        )

    except Exception as error:

        print(
            "Project title detection error:",
            error,
            flush=True
        )

        return json_response(
            {
                "success": False,
                "message":
                    str(error),
            },
            500
        )


# =========================================================
# PRE ASSEMBLY GENERATION
# =========================================================

@app.route(
    "/generate-pre-assembly",
    methods=["POST"]
)
def generate_pre_assembly_route():

    try:

        pdf_file = (
            request.files.get(
                "ebook_pdf"
            )
        )

        if not pdf_file:

            return json_response(
                {
                    "success": False,
                    "message":
                        (
                            "Please upload "
                            "a Project ebook PDF."
                        ),
                },
                400
            )

        filename = str(
            pdf_file.filename or ""
        ).strip()

        project_name = str(
            request.form.get(
                "project_name",
                request.form.get(
                    "chapter_name",
                    ""
                )
            )
        ).strip()

        pdf_file.stream.seek(
            0
        )

        project_content = (
            extract_pdf_text(
                pdf_file
            )
        )

        if not project_content.strip():

            return json_response(
                {
                    "success": False,
                    "message":
                        (
                            "No readable text "
                            "was found in the Project PDF."
                        ),
                },
                400
            )

        if not project_name:

            project_name = (
                detect_project_title(
                    project_content,
                    clean_filename_title(
                        filename
                    )
                )
            )

        print(
            "",
            flush=True
        )

        print(
            "Generating Pre Assembly Quiz:",
            flush=True
        )

        print(
            f"Project: {project_name}",
            flush=True
        )

        print(
            (
                "Source characters: "
                f"{len(project_content)}"
            ),
            flush=True
        )

        assessment = (
            generate_assessment(
                chapter_content=
                    project_content,

                assessment_type=
                    "pre_assembly"
            )
        )

        assessment[
            "project_name"
        ] = project_name

        return json_response(
            {
                "success": True,
                "assessment":
                    assessment,
            }
        )

    except Exception as error:

        print(
            (
                "Pre Assembly generation error: "
                f"{error}"
            ),
            flush=True
        )

        return json_response(
            {
                "success": False,
                "message":
                    str(error),
            },
            500
        )


# =========================================================
# DOWNLOAD PDF
# =========================================================

@app.route(
    "/download-assessment",
    methods=["POST"]
)
def download_assessment_route():

    try:

        data = (
            request.get_json(
                silent=True
            )
            or
            {}
        )

        assessment = data.get(
            "assessment"
        )

        if not assessment:

            return json_response(
                {
                    "success": False,
                    "message":
                        (
                            "Assessment data "
                            "is missing."
                        ),
                },
                400
            )

        title = str(
            data.get(
                "title",
                "EDINNO Assessment"
            )
        ).strip()

        pdf_data = (
            create_assessment_pdf(
                assessment,
                title
            )
        )

        if isinstance(
            pdf_data,
            io.BytesIO
        ):

            pdf_data.seek(
                0
            )

            pdf_stream = (
                pdf_data
            )

        elif isinstance(
            pdf_data,
            bytes
        ):

            pdf_stream = io.BytesIO(
                pdf_data
            )

        else:

            # Some existing PDF generator
            # versions may already return
            # a compatible in-memory stream.
            pdf_stream = pdf_data

            try:
                pdf_stream.seek(
                    0
                )
            except Exception:
                pass

        safe_title = re.sub(
            r"[^A-Za-z0-9 _\-]",
            "",
            title
        ).strip()

        safe_title = (
            safe_title
            or
            "EDINNO_Assessment"
        )

        safe_title = (
            safe_title
            .replace(
                " ",
                "_"
            )
        )

        return send_file(
            pdf_stream,
            mimetype=
                "application/pdf",

            as_attachment=
                True,

            download_name=
                f"{safe_title}.pdf",
        )

    except Exception as error:

        print(
            "PDF generation error:",
            error,
            flush=True
        )

        return json_response(
            {
                "success": False,
                "message":
                    str(error),
            },
            500
        )


# =========================================================
# 413
# =========================================================

@app.errorhandler(413)
def too_large(error):

    return json_response(
        {
            "success": False,
            "message":
                (
                    "Uploaded files are too large. "
                    "Maximum total upload size is 100 MB."
                ),
        },
        413
    )


# =========================================================
# NO CACHE FOR HTML DURING DEVELOPMENT
# =========================================================

@app.after_request
def disable_cache(response):

    if (
        response.mimetype
        ==
        "text/html"
    ):

        response.headers[
            "Cache-Control"
        ] = (
            "no-store, no-cache, "
            "must-revalidate, max-age=0"
        )

        response.headers[
            "Pragma"
        ] = "no-cache"

        response.headers[
            "Expires"
        ] = "0"

    return response


# =========================================================
# START
# =========================================================

if __name__ == "__main__":

    app.run(
        host=
            "127.0.0.1",

        port=
            5000,

        debug=
            True,

        threaded=
            True,

        # Important:
        # prevent Flask's file watcher from
        # restarting during long AI generation.
        use_reloader=
            False,
    )