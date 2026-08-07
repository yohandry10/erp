import { DianApiClientService } from './dian-api-client.service';

describe('DianApiClientService connectivity', () => {
  const config = {
    url: 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
    environment: 'habilitacion' as const,
    nit: '9003739135',
    softwareId: 'software-id',
    softwarePin: 'pin',
    testSetId: 'test-set',
  };

  it('sólo declara transporte listo cuando detecta el WSDL DIAN', async () => {
    const service = new DianApiClientService();
    jest.spyOn((service as any).axiosInstance, 'get').mockResolvedValue({
      status: 200,
      data: '<wsdl:definitions><service name="WcfDianCustomerServices" /></wsdl:definitions>',
    });

    await expect(service.probarConectividad(config)).resolves.toEqual(expect.objectContaining({
      reachable: true,
      serviceDetected: true,
    }));
  });

  it('no confunde una respuesta HTML genérica con DIAN', async () => {
    const service = new DianApiClientService();
    jest.spyOn((service as any).axiosInstance, 'get').mockResolvedValue({ status: 200, data: '<html>ok</html>' });

    await expect(service.probarConectividad(config)).resolves.toEqual(expect.objectContaining({
      reachable: false,
      serviceDetected: false,
    }));
  });

  it('nunca simula aceptación mediante JSON mientras SOAP/XAdES no esté homologado', async () => {
    const service = new DianApiClientService();
    const post = jest.spyOn((service as any).axiosInstance, 'post');

    await expect(service.enviarDocumento('<Invoice />', '<AttachedDocument />', config))
      .resolves.toEqual(expect.objectContaining({
        success: false,
        statusCode: 'DIAN_SOAP_NO_HOMOLOGADO',
      }));
    expect(post).not.toHaveBeenCalled();
  });
});
