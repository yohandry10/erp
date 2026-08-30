import java.io.File;
import java.util.ArrayList;
import java.util.List;
import javax.xml.XMLConstants;
import javax.xml.transform.stream.StreamSource;
import javax.xml.validation.Schema;
import javax.xml.validation.SchemaFactory;
import javax.xml.validation.Validator;
import org.xml.sax.ErrorHandler;
import org.xml.sax.SAXException;
import org.xml.sax.SAXParseException;

/** Validador XSD aislado, sin red ni DTD, para el contrato oficial DIAN. */
public final class ValidateDianXml {
  private ValidateDianXml() {}

  public static void main(String[] args) throws Exception {
    if (args.length != 2) {
      throw new IllegalArgumentException("Usage: ValidateDianXml <schema.xsd> <document.xml>");
    }
    File schemaFile = new File(args[0]).getCanonicalFile();
    File xmlFile = new File(args[1]).getCanonicalFile();
    SchemaFactory factory = SchemaFactory.newInstance(XMLConstants.W3C_XML_SCHEMA_NS_URI);
    factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
    factory.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, "");
    factory.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "file");
    Schema schema = factory.newSchema(schemaFile);
    Validator validator = schema.newValidator();
    validator.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, "");
    validator.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "file");
    List<String> errors = new ArrayList<>();
    validator.setErrorHandler(new ErrorHandler() {
      @Override public void warning(SAXParseException exception) {
        System.err.println(format("warning", exception));
      }
      @Override public void error(SAXParseException exception) {
        errors.add(format("error", exception));
      }
      @Override public void fatalError(SAXParseException exception) {
        errors.add(format("fatal", exception));
      }
    });
    validator.validate(new StreamSource(xmlFile));
    if (!errors.isEmpty()) {
      for (String error : errors) System.err.println(error);
      throw new SAXException("DIAN_XSD_VALIDATION_FAILED: " + errors.size() + " error(s)");
    }
    System.out.println("XSD OK: " + xmlFile.getName() + " <- " + schemaFile.getName());
  }

  private static String format(String level, SAXParseException exception) {
    return level + " line=" + exception.getLineNumber()
      + " column=" + exception.getColumnNumber() + ": " + exception.getMessage();
  }
}
