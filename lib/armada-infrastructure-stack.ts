import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr'
import { SecurityGroup } from 'aws-cdk-lib/aws-ec2';

export class ArmadaInfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a Virtual Private Network
    const vpc = new ec2.Vpc(this, 'TheVPC', {
      cidr: "10.0.0.0/16",
      subnetConfiguration: [
        {
          name: 'public-subnet',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24
        }
      ],
      natGateways: 0,
    })

    // EC2 Instance Security Group
    const SecurityGroup = new ec2.SecurityGroup(this, 'armada-security-group', {
      vpc: vpc,
      description: 'Security Group for Armada Instance',
      allowAllIpv6Outbound: true,
      allowAllOutbound: true,
      securityGroupName: "Armada Security Group"
    })

    // Allow SSH
    SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'SSH Access'
    );

    // Allow HTTP
    SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'HTTP Access'
    );
  
    // Allow HTTPS
    SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'HTTPS Access'
    );

    // user data
    const userData = ec2.UserData.forLinux();
    const dockerCommands = [
      "sudo apt update",
      "sudo apt install apt-transport-https ca-certificates curl software-properties-common",
      "curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg",
      'echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null',
      "sudo apt update",
      "apt-cache policy docker-ce",
      "sudo apt install docker-ce",
      "sudo systemctl status docker",
      "sudo systemctl enable docker", 
      "sudo usermod -aG docker ${USER}",
      "su - ${USER}",
      "docker run --publish 80:80 --detach nginx"
    ]
  
    userData.addCommands(...dockerCommands)

    // TODO: get AMI ID from SSM param store to get portable deployments
    const latestUbuntuImageURL = "/aws/service/canonical/ubuntu/server/focal/stable/current/amd64/hvm/ebs-gp2/ami-id";
    const instanceAMI = ec2.MachineImage.fromSsmParameter(
      latestUbuntuImageURL, {
        os: ec2.OperatingSystemType.LINUX,
        userData: userData
      }
    );

    // EC2 instance
    new ec2.Instance(this, 'Instance', {
      vpc: vpc,
      keyName: 'kp-us-east-1', 
      instanceType: new ec2.InstanceType('t2.micro'),
      machineImage: instanceAMI,
      securityGroup: SecurityGroup,

      blockDevices: [
        {
          deviceName: '/dev/sdf',
          volume: ec2.BlockDeviceVolume.ebs(8, {
            volumeType: ec2.EbsDeviceVolumeType.GENERAL_PURPOSE_SSD_GP3
          })
        },
      ]
    })

    // Elastic Container Registry
    const repository = new ecr.Repository(this, 'Repository')
  }
}
