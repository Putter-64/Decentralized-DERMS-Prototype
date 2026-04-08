/**
 * Expected WebID per DER pod folder name. Keep `webId` values in sync with `solid_devices.json`
 * (same keys); do not put passwords in the client bundle.
 */
export type DerPodWebIdMap = Record<string, string>;

export const DER_POD_WEBIDS: DerPodWebIdMap = {
  PV_Power_Plant_1000:
    'https://ec2-34-201-119-230.compute-1.amazonaws.com/PV_Power_Plant_1000/profile/card#me',
  PV_Power_Plant_1001:
    'https://ec2-34-201-119-230.compute-1.amazonaws.com/PV_Power_Plant_1001/profile/card#me',
  PV_Power_Plant_1002:
    'https://ec2-34-201-119-230.compute-1.amazonaws.com/PV_Power_Plant_1002/profile/card#me',
  PV_Power_Plant_1003:
    'https://ec2-34-201-119-230.compute-1.amazonaws.com/PV_Power_Plant_1003/profile/card#me',
  Battery_1004: 'https://ec2-34-201-119-230.compute-1.amazonaws.com/Battery_1004/profile/card#me',
  Battery_1005: 'https://ec2-34-201-119-230.compute-1.amazonaws.com/Battery_1005/profile/card#me',
  Battery_1006: 'https://ec2-34-201-119-230.compute-1.amazonaws.com/Battery_1006/profile/card#me',
  Battery_1007: 'https://ec2-34-201-119-230.compute-1.amazonaws.com/Battery_1007/profile/card#me',
  Wind_Power_Plant_1008:
    'https://ec2-34-201-119-230.compute-1.amazonaws.com/Wind_Power_Plant_1008/profile/card#me',
  Wind_Power_Plant_1009:
    'https://ec2-34-201-119-230.compute-1.amazonaws.com/Wind_Power_Plant_1009/profile/card#me',
  Wind_Power_Plant_1010:
    'https://ec2-34-201-119-230.compute-1.amazonaws.com/Wind_Power_Plant_1010/profile/card#me',
  Wind_Power_Plant_1011:
    'https://ec2-34-201-119-230.compute-1.amazonaws.com/Wind_Power_Plant_1011/profile/card#me',
  Diesel_Generator_1012:
    'https://ec2-34-201-119-230.compute-1.amazonaws.com/Diesel_Generator_1012/profile/card#me',
  /** Dedicated pod for Modbus RDF (parsed via `modbusParser` / `detectAndParse`). */
  modbusPod:
    'https://ec2-34-201-119-230.compute-1.amazonaws.com/modbusPod/profile/card#me',
};

export function listDerPodNames(): string[] {
  return Object.keys(DER_POD_WEBIDS).sort((a, b) => a.localeCompare(b));
}

export function getExpectedWebIdForPod(podName: string): string | undefined {
  return DER_POD_WEBIDS[podName];
}

export function webIdsEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  try {
    return new URL(a).href === new URL(b).href;
  } catch {
    return a.trim() === b.trim();
  }
}

/**
 * Known DER pods require the browser session WebID to match.
 * Unlisted pod names (manual entry) are still attempted so ad-hoc pods can work.
 */
export function sessionCanAccessPod(sessionWebId: string | undefined, podName: string): boolean {
  if (!sessionWebId) return false;
  const expected = getExpectedWebIdForPod(podName);
  if (expected === undefined) return true;
  return webIdsEqual(sessionWebId, expected);
}
