import { getFile, getSolidDataset } from '@inrupt/solid-client';
import { getDefaultSession } from '@inrupt/solid-client-authn-browser';

const baseURI = import.meta.env.VITE_BASE_URI;

export class DebugService {
  private session = getDefaultSession();

  async debugPodStructure(podName: string) {
    try {
      console.log('POD DEBUGGING');
      console.log('Base URI:', baseURI);
      console.log('Pod Name:', podName);
      console.log('Session logged in:', this.session.info.isLoggedIn);
      console.log('WebID:', this.session.info.webId);

      // Test 1: Try to get the root container
      const rootUrl = `${baseURI}/${podName}/`;
      console.log('Testing root URL:', rootUrl);
      
      try {
        await getSolidDataset(rootUrl, { fetch: this.session.fetch });
        console.log('Root container accessible!');
      } catch (error) {
        console.log('Root container not accessible:', error);
      }

      // Test 2: Try modbus container
      const modbusContainerUrl = `${baseURI}/${podName}/modbus/`;
      console.log('Testing modbus container URL:', modbusContainerUrl);
      
      try {
        await getSolidDataset(modbusContainerUrl, { fetch: this.session.fetch });
        console.log(' Modbus container accessible!');
      } catch (error) {
        console.log('Modbus container not accessible:', error);
      }

      // Test 3: Try specific modbus file
      const modbusFileUrl = `${baseURI}/${podName}/modbus/slave/1`;
      console.log('Testing modbus file URL:', modbusFileUrl);
      
      try {
        const modbusFile = await getFile(modbusFileUrl, { fetch: this.session.fetch });
        console.log('Modbus file exists');
        if (modbusFile) {
          const content = await modbusFile.text();
          console.log('File content length:', content.length);
          console.log('First 500 chars:', content.substring(0, 500));
        }
      } catch (error) {
        console.log('Modbus file not accessible:', error);
      }

    } catch (error) {
      console.error('Debugging failed:', error);
    }
  }
}