
import pymupdf


def extract_pdf_text(pdf_file):
    """
    Extract text from all pages of a PDF.
    """

    extracted_text = []

    try:
        with pymupdf.open(stream=pdf_file.read(), filetype="pdf") as doc:

            for page_number, page in enumerate(doc, start=1):

                page_text = page.get_text("text", sort=True)

                if page_text.strip():
                    extracted_text.append(
                        f"Page {page_number}\n{page_text}"
                    )

        return "\n\n".join(extracted_text)

    except Exception as error:
        print(f"PDF reading error: {error}")
        raise ValueError("Unable to read this PDF.") from error
