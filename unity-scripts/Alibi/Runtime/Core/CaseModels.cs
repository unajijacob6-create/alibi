// Data types that mirror the case service's JSON (see case-service/src/types.ts).
// Field names match the JSON exactly so Unity's JsonUtility can read and write them.
// This folder has no Unity dependencies, so it is also compiled and tested outside Unity.

using System;

namespace Alibi.Core
{
    [Serializable]
    public class RoomObject
    {
        public string id;
        public string label;
        public string[] text;
        public string clueWord;
        public bool visibleFromSeat;
        public float confidence;
        public bool prop;
    }

    [Serializable]
    public class Box
    {
        public float x;
        public float y;
        public float w;
        public float h;
    }

    [Serializable]
    public class Sighting
    {
        public int frameIndex;
        public Box box;
    }

    [Serializable]
    public class ScannedObject : RoomObject
    {
        public Sighting[] sightings;
    }

    [Serializable]
    public class Victim
    {
        public string name;
        public string occupation;
    }

    [Serializable]
    public class CaptionWord
    {
        public string wordId;
        public string text;
        public int start;
        public int end;
    }

    [Serializable]
    public class CaptionLine
    {
        public string id;
        public string text;
        public CaptionWord[] words;
    }

    [Serializable]
    public class Suspect
    {
        public string id;
        public string name;
        public string relation;
        public bool isLiar;
        public CaptionLine[] lines;
    }

    [Serializable]
    public class Pin
    {
        public string wordId;
        public string objectId;
        public string label;
    }

    [Serializable]
    public class HerringInfo
    {
        public string wordId;
        public string nearObjectId;
        public string rebuttal;
    }

    [Serializable]
    public class Glance
    {
        public string wordId;
        public string objectId;
        public int leadMs;
    }

    [Serializable]
    public class CaseFile
    {
        public int version;
        public string caseId;
        public int seed;
        public string writer;
        public Victim victim;
        public string timeOfDeath;
        public string[] intro;
        public Suspect[] suspects;
        public Pin[] pins;
        public HerringInfo[] herrings;
        public Glance[] glances;
        public string confession;
        public RoomObject[] props;
    }

    // ---- Requests and responses -------------------------------------------

    [Serializable]
    public class ScanFrame
    {
        public string jpegBase64;
    }

    [Serializable]
    public class ScanRequest
    {
        public ScanFrame[] frames;
    }

    [Serializable]
    public class ScanResponse
    {
        public ScannedObject[] objects;
    }

    [Serializable]
    public class CaseRequest
    {
        public RoomObject[] room;
        public int seed;
        public bool offline;
    }

    [Serializable]
    public class Attempt
    {
        public string writer;
        public bool ok;
        public string[] errors;
    }

    [Serializable]
    public class CaseResponse
    {
        public CaseFile caseFile;
        public Attempt[] attempts;
    }
}
